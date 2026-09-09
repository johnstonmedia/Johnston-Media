"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import {
  atLeast,
  MERGE_FIELDS,
  type Audience,
  type Campaign,
  type EmailAccess,
  type EmailTemplate,
} from "@/lib/emailTypes";

import styles from "./email.module.css";

const DEFAULT_FROM =
  process.env.NEXT_PUBLIC_EMAIL_FROM ?? "hello@wjohnstonmedia.com";

/** A starting body that already satisfies the unsubscribe requirement. */
const STARTER = `<p>Hi {{name}},</p>

<p>Write your message here.</p>

<p>— {{sender_name}}</p>

<p style="font-size:12px;color:#888">
  You're getting this because you asked to hear from us.
  <a href="{{unsubscribe_url}}">Unsubscribe</a>.
</p>`;

function statusTone(status: Campaign["status"]): string {
  switch (status) {
    case "Sent":
      return "jm-badge--success";
    case "Sending":
      return "jm-badge--teal";
    case "Failed":
      return "jm-badge--error";
    case "Scheduled":
      return "jm-badge--amber";
    default:
      return "jm-badge--muted";
  }
}

export default function CampaignsPanel({
  access,
  getToken,
}: {
  access: EmailAccess;
  getToken: () => Promise<string | null>;
}) {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const canEdit = atLeast(access.level, "draft");
  const canSend = atLeast(access.level, "send");

  const load = useCallback(async () => {
    try {
      const db = getDb();
      const [camps, auds, tpls] = await Promise.all([
        getDocs(query(collection(db, "campaigns"), orderBy("createdAt", "desc"))),
        getDocs(collection(db, "audiences")),
        getDocs(collection(db, "emailTemplates")),
      ]);
      setCampaigns(
        camps.docs.map((d) => ({ id: d.id, ...d.data() }) as Campaign),
      );
      setAudiences(auds.docs.map((d) => ({ id: d.id, ...d.data() }) as Audience));
      setTemplates(
        tpls.docs.map((d) => ({ id: d.id, ...d.data() }) as EmailTemplate),
      );
    } catch (err) {
      console.error("[email] campaigns failed:", err);
      setCampaigns([]);
      toast("Could not load campaigns.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDraft() {
    setBusy(true);
    try {
      const fallback = templates.find((t) => t.isDefault) ?? templates[0];
      const draft: Omit<Campaign, "id"> = {
        name: "Untitled campaign",
        subject: "",
        fromName: "Johnston Media",
        fromEmail: access.allowedFrom[0] ?? DEFAULT_FROM,
        html: STARTER,
        templateId: fallback?.id,
        status: "Draft",
        createdBy: access.email,
        createdAt: new Date().toISOString(),
      };
      const ref = await addDoc(collection(getDb(), "campaigns"), draft);
      setEditing({ id: ref.id, ...draft });
      void load();
    } catch (err) {
      console.error("[email] create failed:", err);
      toast("Could not start a draft.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function save(next: Campaign) {
    setBusy(true);
    try {
      const { id, ...rest } = next;
      await updateDoc(doc(getDb(), "campaigns", id), {
        ...rest,
        updatedAt: new Date().toISOString(),
      });
      setCampaigns(
        (prev) => prev?.map((c) => (c.id === id ? next : c)) ?? null,
      );
      toast("Saved.");
    } catch (err) {
      console.error("[email] save failed:", err);
      toast("Could not save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(campaign: Campaign) {
    if (campaign.status === "Sent") {
      toast("A sent campaign is a record — it stays.", "error");
      return;
    }
    if (!window.confirm(`Delete “${campaign.name}”?`)) return;
    try {
      await deleteDoc(doc(getDb(), "campaigns", campaign.id));
      setCampaigns((prev) => prev?.filter((c) => c.id !== campaign.id) ?? null);
      if (editing?.id === campaign.id) setEditing(null);
      toast("Deleted.");
    } catch {
      toast("Could not delete that.", "error");
    }
  }

  /** Sends a test to one address, or the real thing to the audience. */
  async function send(campaign: Campaign, test: boolean) {
    if (!test) {
      const audience = audiences.find((a) => a.id === campaign.audienceId);
      const where = audience ? `“${audience.name}”` : "everyone subscribed";
      if (
        !window.confirm(
          `Send “${campaign.subject}” to ${where}?\n\nThis cannot be undone.`,
        )
      ) {
        return;
      }
    }

    setBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }

      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ campaignId: campaign.id, test }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        toast(result.error ?? "The send failed.", "error");
        return;
      }

      toast(
        test
          ? `Test sent to ${result.to}.`
          : `Sent to ${result.stats.sent} of ${result.stats.recipients}.`,
      );
      void load();
      if (!test) setEditing(null);
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  // ── Composer ──────────────────────────────────────
  if (editing) {
    const template = templates.find((t) => t.id === editing.templateId);
    const previewHtml = template
      ? template.html.replace("{{content}}", editing.html)
      : editing.html;
    const locked = editing.status === "Sent" || editing.status === "Sending";

    return (
      <>
        <div className={styles.head}>
          <div>
            <h1 className={styles.title}>{editing.name || "Campaign"}</h1>
            <p className={styles.sub}>
              {locked
                ? "This one has gone out — it's kept as a record and can't be edited."
                : "Write it, preview it against the template, send yourself a test, then send it properly."}
            </p>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className="jm-btn-ghost jm-btn-sm"
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? "Edit" : "Preview"}
            </button>
            {canSend && !locked ? (
              <>
                <button
                  type="button"
                  className="jm-btn-ghost jm-btn-sm"
                  onClick={() => send(editing, true)}
                  disabled={busy}
                >
                  Send test to me
                </button>
                <button
                  type="button"
                  className="jm-btn-primary jm-btn-sm"
                  onClick={() => send(editing, false)}
                  disabled={busy}
                >
                  Send campaign
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="jm-btn-ghost jm-btn-sm"
              onClick={() => {
                setEditing(null);
                setPreview(false);
              }}
            >
              Close
            </button>
          </div>
        </div>

        {preview ? (
          <iframe
            className={styles.preview}
            title="Campaign preview"
            // Sandboxed with no allow-scripts: a template is HTML from a person,
            // and it should never be able to run code in the platform's origin.
            sandbox=""
            srcDoc={previewHtml}
          />
        ) : (
          <div className={styles.composer}>
            <div>
              <div className={styles.field2}>
                <div className="jm-field">
                  <label className="jm-label" htmlFor="c-name">
                    Internal name
                  </label>
                  <input
                    id="c-name"
                    className="jm-input"
                    value={editing.name}
                    disabled={locked}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                  />
                </div>
                <div className="jm-field">
                  <label className="jm-label" htmlFor="c-audience">
                    Audience
                  </label>
                  <select
                    id="c-audience"
                    className="jm-select"
                    value={editing.audienceId ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      setEditing({ ...editing, audienceId: e.target.value })
                    }
                  >
                    <option value="">Everyone subscribed</option>
                    {audiences.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="jm-field">
                <label className="jm-label" htmlFor="c-subject">
                  Subject line
                </label>
                <input
                  id="c-subject"
                  className="jm-input"
                  value={editing.subject}
                  placeholder="What lands in their inbox"
                  disabled={locked}
                  onChange={(e) =>
                    setEditing({ ...editing, subject: e.target.value })
                  }
                />
              </div>

              <div className={styles.field2}>
                <div className="jm-field">
                  <label className="jm-label" htmlFor="c-fromname">
                    From name
                  </label>
                  <input
                    id="c-fromname"
                    className="jm-input"
                    value={editing.fromName}
                    disabled={locked}
                    onChange={(e) =>
                      setEditing({ ...editing, fromName: e.target.value })
                    }
                  />
                </div>
                <div className="jm-field">
                  <label className="jm-label" htmlFor="c-fromemail">
                    From address
                  </label>
                  {access.level === "admin" ? (
                    <input
                      id="c-fromemail"
                      className="jm-input"
                      value={editing.fromEmail}
                      disabled={locked}
                      onChange={(e) =>
                        setEditing({ ...editing, fromEmail: e.target.value })
                      }
                    />
                  ) : (
                    <select
                      id="c-fromemail"
                      className="jm-select"
                      value={editing.fromEmail}
                      disabled={locked}
                      onChange={(e) =>
                        setEditing({ ...editing, fromEmail: e.target.value })
                      }
                    >
                      {access.allowedFrom.length === 0 ? (
                        <option value="">No addresses allowed for you</option>
                      ) : null}
                      {access.allowedFrom.map((address) => (
                        <option key={address} value={address}>
                          {address}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="jm-field">
                <label className="jm-label" htmlFor="c-template">
                  Template
                </label>
                <select
                  id="c-template"
                  className="jm-select"
                  value={editing.templateId ?? ""}
                  disabled={locked}
                  onChange={(e) =>
                    setEditing({ ...editing, templateId: e.target.value })
                  }
                >
                  <option value="">No template — send the body as-is</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="jm-field">
                <label className="jm-label" htmlFor="c-html">
                  Content
                </label>
                <textarea
                  id="c-html"
                  className={styles.editor}
                  value={editing.html}
                  disabled={locked}
                  spellCheck
                  onChange={(e) =>
                    setEditing({ ...editing, html: e.target.value })
                  }
                />
              </div>

              {canEdit && !locked ? (
                <button
                  type="button"
                  className="jm-btn-primary"
                  onClick={() => save(editing)}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save draft"}
                </button>
              ) : null}
            </div>

            <aside className={styles.aside}>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Merge fields</h3>
                <div className={styles.tokens}>
                  {MERGE_FIELDS.map((field) => (
                    <button
                      key={field.token}
                      type="button"
                      className={styles.token}
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(field.token)
                          .then(() => toast(`${field.token} copied.`))
                          .catch(() => {});
                      }}
                    >
                      <code>{field.token}</code>
                      <span>{field.describes}</span>
                    </button>
                  ))}
                </div>
              </div>

              {editing.stats ? (
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Result</h3>
                  <p className={styles.rowMeta}>
                    {editing.stats.sent} sent · {editing.stats.failed} failed ·{" "}
                    {editing.stats.skipped} skipped
                  </p>
                  {editing.lastError ? (
                    <p className={styles.rowMeta} style={{ color: "var(--jm-error)" }}>
                      {editing.lastError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </>
    );
  }

  // ── List ──────────────────────────────────────────
  return (
    <>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Campaigns</h1>
          <p className={styles.sub}>
            Marketing sends. Every one carries a one-click unsubscribe header,
            and a campaign without an unsubscribe link in its content is refused
            before it leaves.
          </p>
        </div>
        {canEdit ? (
          <div className={styles.actions}>
            <button
              type="button"
              className="jm-btn-primary jm-btn-sm"
              onClick={createDraft}
              disabled={busy}
            >
              + New campaign
            </button>
          </div>
        ) : null}
      </div>

      {campaigns === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : campaigns.length === 0 ? (
        <div className={styles.empty}>
          <strong>Nothing sent yet</strong>
          Start a draft, point it at an audience, and send yourself a test
          first.
        </div>
      ) : (
        <div className={styles.list}>
          {campaigns.map((campaign) => (
            <article key={campaign.id} className={styles.row}>
              <div className={styles.rowMain}>
                <h3 className={styles.rowTitle}>
                  {campaign.subject || campaign.name}
                </h3>
                <p className={styles.rowMeta}>
                  {campaign.name} · from {campaign.fromEmail}
                  {campaign.stats
                    ? ` · ${campaign.stats.sent} sent`
                    : ""}
                  {campaign.sentAt
                    ? ` · ${new Date(campaign.sentAt).toLocaleDateString("en-AU")}`
                    : ""}
                </p>
              </div>
              <div className={styles.rowActions}>
                <span className={`jm-badge ${statusTone(campaign.status)}`}>
                  {campaign.status}
                </span>
                <button
                  type="button"
                  className="jm-btn-ghost jm-btn-sm"
                  onClick={() => setEditing(campaign)}
                >
                  {campaign.status === "Sent" ? "View" : "Edit"}
                </button>
                {canEdit && campaign.status !== "Sent" ? (
                  <button
                    type="button"
                    className="jm-btn-ghost jm-btn-sm"
                    onClick={() => remove(campaign)}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
