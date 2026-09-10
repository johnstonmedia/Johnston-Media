"use client";

import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import {
  SQUARE_DASHBOARD,
  squareCustomerUrl,
  squareInvoiceUrl,
} from "@/lib/squareLinks";
import {
  PIPELINE_STAGES,
  PRODUCTION_STAGES,
  formatMoney,
  type PipelineStage,
  type ProductionStage,
  type Project,
  type Quote,
  type SquareDocKind,
  type SquareDocRef,
} from "@/lib/types";

import styles from "./admin.module.css";
import NewProjectModal from "./NewProjectModal";
import SquareDocModal from "./SquareDocModal";

/** Where a project sits when nothing has set the stage yet. */
const DEFAULT_STAGE: PipelineStage = "Booked";

const FILTERS: {
  id: string;
  label: string;
  match: (p: Project) => boolean;
}[] = [
  {
    id: "open",
    label: "Open",
    match: (p) => (p.pipelineStage ?? DEFAULT_STAGE) !== "Complete",
  },
  ...PIPELINE_STAGES.map((stage) => ({
    id: stage,
    label: stage,
    match: (p: Project) => (p.pipelineStage ?? DEFAULT_STAGE) === stage,
  })),
  { id: "all", label: "All", match: () => true },
];

function shortDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** One line summarising a Square-managed document. */
function describeDoc(doc: SquareDocRef): string {
  const parts: string[] = [];
  if (doc.reference) parts.push(doc.reference);
  if (doc.amountCents !== undefined) {
    parts.push(formatMoney(doc.amountCents, doc.currency));
  }
  if (doc.status) parts.push(doc.status.toLowerCase());
  if (doc.resolvedAt) parts.push(shortDate(doc.resolvedAt));
  else if (doc.sentAt) parts.push(`sent ${shortDate(doc.sentAt)}`);
  return parts.join(" · ");
}

type StepState = "done" | "active" | "todo";

interface ChainStep {
  label: string;
  state: StepState;
  detail: string;
  href?: string;
}

/**
 * The job, start to finish.
 *
 * Request → estimate → contract → invoice → delivery. Each link is either
 * something the site holds itself (the quote, the native estimate, the Square
 * invoice we created through the API) or something you recorded from Square.
 * Read together they answer the only question that matters mid-job: what's
 * been done, and what's next.
 */
function buildChain(project: Project, quote: Quote | undefined): ChainStep[] {
  const steps: ChainStep[] = [];

  // 1 — the original request.
  steps.push(
    quote
      ? {
          label: "Request",
          state: "done",
          detail: `${quote.source === "web" ? "Web" : "Media"} enquiry · ${shortDate(quote.createdAt)}`,
        }
      : {
          label: "Request",
          state: "done",
          detail: "Started directly",
        },
  );

  // 2 — the estimate, from whichever side it was made.
  const nativeEstimate = quote?.estimate;
  if (project.estimateRef) {
    steps.push({
      label: "Estimate",
      state: project.estimateRef.resolvedAt ? "done" : "active",
      detail: describeDoc(project.estimateRef) || "Recorded from Square",
      href: project.estimateRef.url,
    });
  } else if (nativeEstimate) {
    steps.push({
      label: "Estimate",
      state: nativeEstimate.acceptedAt
        ? "done"
        : nativeEstimate.declinedAt
          ? "todo"
          : "active",
      detail: [
        formatMoney(nativeEstimate.totalCents, nativeEstimate.currency),
        nativeEstimate.acceptedAt
          ? `accepted ${shortDate(nativeEstimate.acceptedAt)}`
          : nativeEstimate.declinedAt
            ? `declined ${shortDate(nativeEstimate.declinedAt)}`
            : "awaiting reply",
      ].join(" · "),
    });
  } else {
    steps.push({ label: "Estimate", state: "todo", detail: "Not sent" });
  }

  // 3 — the contract, which only ever lives in Square.
  steps.push(
    project.contractRef
      ? {
          label: "Contract",
          state: project.contractRef.resolvedAt ? "done" : "active",
          detail: describeDoc(project.contractRef) || "Recorded from Square",
          href: project.contractRef.url,
        }
      : { label: "Contract", state: "todo", detail: "Not recorded" },
  );

  // 4 — the invoice, which we create through the Square API.
  if (quote?.squareInvoiceId) {
    const paid = quote.status === "Paid";
    steps.push({
      label: "Invoice",
      state: paid ? "done" : "active",
      detail: [
        quote.squareInvoiceNumber ? `#${quote.squareInvoiceNumber}` : "Sent",
        quote.amountCents !== undefined
          ? formatMoney(quote.amountCents, quote.currency)
          : "",
        quote.status.toLowerCase(),
      ]
        .filter(Boolean)
        .join(" · "),
      href:
        squareInvoiceUrl(quote.squareInvoiceId) ?? SQUARE_DASHBOARD.invoices,
    });
  } else {
    steps.push({ label: "Invoice", state: "todo", detail: "Not raised" });
  }

  // 5 — the part the client actually waits for.
  const delivered = project.status === "Delivered";
  steps.push({
    label: "Delivery",
    state: delivered ? "done" : "active",
    detail: delivered
      ? `Delivered · ${project.files?.length ?? 0} file${project.files?.length === 1 ? "" : "s"}`
      : project.status,
  });

  return steps;
}

export default function ProjectsPanel({
  getToken,
  onCount,
}: {
  getToken: () => Promise<string | null>;
  onCount: (n: number) => void;
}) {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [filter, setFilter] = useState("open");
  const [updating, setUpdating] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState<{
    project: Project;
    kind: SquareDocKind;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const db = getDb();
      // Quotes come along so each project can show the whole chain — the
      // request and the invoice both live on the quote.
      const [projectSnap, quoteSnap] = await Promise.all([
        getDocs(collection(db, "projects")),
        getDocs(collection(db, "quotes")),
      ]);

      const rows = projectSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Project,
      );
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setProjects(rows);
      setQuotes(
        quoteSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Quote),
      );
    } catch (err) {
      console.error("[admin] projects failed:", err);
      setProjects([]);
      toast("Could not load projects.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (projects) {
      onCount(
        projects.filter(
          (p) => (p.pipelineStage ?? DEFAULT_STAGE) !== "Complete",
        ).length,
      );
    }
  }, [projects, onCount]);

  const quotesById = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const quote of quotes) map.set(quote.id, quote);
    return map;
  }, [quotes]);

  /** Quotes that haven't become a project yet — the pool for "New project". */
  const unlinkedQuotes = useMemo(() => {
    const taken = new Set(
      (projects ?? []).map((p) => p.quoteId).filter(Boolean) as string[],
    );
    return quotes.filter((quote) => !taken.has(quote.id));
  }, [quotes, projects]);

  const visible = useMemo(() => {
    const match = FILTERS.find((f) => f.id === filter)?.match ?? (() => true);
    return (projects ?? []).filter(match);
  }, [projects, filter]);

  /**
   * Both stages go through the API rather than a direct Firestore write, so a
   * production move can't happen without the client's email firing with it.
   */
  async function move(
    project: Project,
    change: { stage?: ProductionStage; pipelineStage?: PipelineStage },
  ) {
    setUpdating(project.id);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }

      const response = await fetch("/api/project/stage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId: project.id, ...change }),
      });
      const result = await response.json();

      if (!response.ok) {
        toast(result.error ?? "Could not update the project.", "error");
        return;
      }

      setProjects(
        (prev) =>
          prev?.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  status: change.stage ?? p.status,
                  pipelineStage: change.pipelineStage ?? p.pipelineStage,
                }
              : p,
          ) ?? null,
      );

      if (change.stage) {
        toast(
          result.emailed
            ? `Moved to ${change.stage} — client notified.`
            : `Moved to ${change.stage}.`,
        );
      } else {
        toast(`Moved to ${change.pipelineStage}.`);
      }
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setUpdating(null);
    }
  }

  function applyRecord(
    projectId: string,
    kind: SquareDocKind,
    record: SquareDocRef,
  ) {
    setProjects(
      (prev) =>
        prev?.map((p) =>
          p.id === projectId
            ? {
                ...p,
                [kind === "estimate" ? "estimateRef" : "contractRef"]: record,
              }
            : p,
        ) ?? null,
    );
    setRecording(null);
  }

  return (
    <section>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Projects</h2>
        <div className={styles.filters}>
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.filter} ${
                filter === item.id ? styles.filterActive : ""
              }`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.panelBar}>
        <button
          type="button"
          className="jm-btn-primary jm-btn-sm"
          onClick={() => setCreating(true)}
        >
          + New project
        </button>
        <a
          className="jm-btn-ghost jm-btn-sm"
          href={SQUARE_DASHBOARD.projects}
          target="_blank"
          rel="noopener noreferrer"
        >
          Square board ↗
        </a>
      </div>

      {projects === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : visible.length === 0 ? (
        <p className={styles.empty}>
          {projects.length === 0
            ? "Projects open automatically when an invoice is paid — or start one above."
            : "Nothing at this stage."}
        </p>
      ) : (
        <div className={styles.list}>
          {visible.map((project) => {
            const quote = project.quoteId
              ? quotesById.get(project.quoteId)
              : undefined;
            const chain = buildChain(project, quote);
            const stage = project.pipelineStage ?? DEFAULT_STAGE;
            const busy = updating === project.id;
            const dashCustomer = squareCustomerUrl(project.squareCustomerId);

            return (
              <article key={project.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <h3 className={styles.rowTitle}>{project.name}</h3>
                  <p className={styles.rowMeta}>
                    {project.clientName}
                    {project.serviceType ? ` · ${project.serviceType}` : ""}
                    {project.clientEmail ? (
                      <>
                        <br />
                        {project.clientEmail}
                      </>
                    ) : null}
                  </p>
                </div>

                <div className={styles.rowActions}>
                  <label className={styles.stagePicker}>
                    <span>Board</span>
                    <select
                      className="jm-select"
                      value={stage}
                      disabled={busy}
                      onChange={(e) =>
                        move(project, {
                          pipelineStage: e.target.value as PipelineStage,
                        })
                      }
                      aria-label={`Board stage for ${project.name}`}
                    >
                      {PIPELINE_STAGES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.stagePicker}>
                    <span>Production</span>
                    <select
                      className="jm-select"
                      value={project.status}
                      disabled={busy}
                      onChange={(e) =>
                        move(project, {
                          stage: e.target.value as ProductionStage,
                        })
                      }
                      aria-label={`Production stage for ${project.name}`}
                    >
                      {PRODUCTION_STAGES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Full width, on its own line — five steps need the room. */}
                <ol className={styles.chain}>
                  {chain.map((step) => (
                    <li
                      key={step.label}
                      className={`${styles.chainStep} ${
                        step.state === "done"
                          ? styles.chainDone
                          : step.state === "active"
                            ? styles.chainActive
                            : ""
                      }`}
                    >
                      <span className={styles.chainLabel}>
                        {step.href ? (
                          <a
                            href={step.href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {step.label} ↗
                          </a>
                        ) : (
                          step.label
                        )}
                      </span>
                      <span className={styles.chainDetail}>{step.detail}</span>
                    </li>
                  ))}
                </ol>

                <p className={styles.squareLinks}>
                  <a
                    href={project.squareProjectUrl ?? SQUARE_DASHBOARD.projects}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {project.squareProjectUrl
                      ? "Open in Square"
                      : "Square board"}
                  </a>
                  {project.squareCustomerId ? (
                    <a
                      href={dashCustomer ?? SQUARE_DASHBOARD.customers}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Customer record
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setRecording({ project, kind: "estimate" })}
                  >
                    {project.estimateRef
                      ? "Update estimate"
                      : "Record estimate"}
                  </button>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setRecording({ project, kind: "contract" })}
                  >
                    {project.contractRef
                      ? "Update contract"
                      : "Record contract"}
                  </button>
                </p>
              </article>
            );
          })}
        </div>
      )}

      {creating ? (
        <NewProjectModal
          quotes={unlinkedQuotes}
          getToken={getToken}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      ) : null}

      {recording ? (
        <SquareDocModal
          project={recording.project}
          kind={recording.kind}
          getToken={getToken}
          onClose={() => setRecording(null)}
          onSaved={(kind, record) =>
            applyRecord(recording.project.id, kind, record)
          }
        />
      ) : null}
    </section>
  );
}
