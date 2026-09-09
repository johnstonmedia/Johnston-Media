"use client";

import {
  collection,
  doc,
  getDocs,
  or,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import AuthGate from "@/components/AuthGate";
import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import {
  formatMoney,
  isQuotePayable,
  PROJECT_STAGES,
  type Project,
  type Quote,
  type UserProfile,
} from "@/lib/types";

import styles from "./portal.module.css";

export default function PortalPage() {
  return (
    <AuthGate
      title="Client Portal"
      subtitle="Sign in to track your quotes, follow project progress and collect your finished files."
    >
      {({ profile, signOut }) => (
        <PortalDashboard profile={profile} signOut={signOut} />
      )}
    </AuthGate>
  );
}

function statusTone(status: Quote["status"]): string {
  switch (status) {
    case "Paid":
    case "Approved":
      return "jm-badge--success";
    case "Invoiced":
    case "Sent":
    case "Deposit Paid":
      return "jm-badge--copper";
    case "Declined":
    case "Cancelled":
    case "Refunded":
      return "jm-badge--error";
    case "Accepted":
    case "Reviewed":
      return "jm-badge--teal";
    default:
      return "jm-badge--amber";
  }
}

function PortalDashboard({
  profile,
  signOut,
}: {
  profile: UserProfile;
  signOut: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const db = getDb();

    try {
      // Quotes are matched on uid OR email — quotes requested before the
      // client had an account are only linked by the email they typed in.
      const quoteSnap = await getDocs(
        query(
          collection(db, "quotes"),
          or(
            where("clientId", "==", profile.id),
            where("clientEmail", "==", profile.email.toLowerCase()),
          ),
        ),
      );
      const rows = quoteSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Quote,
      );
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setQuotes(rows);
    } catch (err) {
      console.error("[portal] quotes failed:", err);
      setQuotes([]);
    }

    try {
      const projectSnap = await getDocs(
        query(collection(db, "projects"), where("clientId", "==", profile.id)),
      );
      const rows = projectSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Project,
      );
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setProjects(rows);
    } catch (err) {
      console.error("[portal] projects failed:", err);
      setProjects([]);
    }
  }, [profile.id, profile.email]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await updateDoc(doc(getDb(), "users", profile.id), {
        name: String(data.get("name") ?? "").trim(),
        phone: String(data.get("phone") ?? "").trim(),
      });
      toast("Details saved.");
    } catch (err) {
      console.error("[portal] save failed:", err);
      toast("Could not save your details.", "error");
    } finally {
      setSaving(false);
    }
  }

  const firstName = (profile.name || profile.email).split(/[\s@]/)[0];

  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.greeting}>
              Welcome back, {firstName}.
            </h1>
            <div className={styles.sub}>
              <span className="jm-badge jm-badge--teal">{profile.role}</span>
              <span>{profile.email}</span>
            </div>
          </div>
          <button type="button" className="jm-btn-ghost jm-btn-sm" onClick={signOut}>
            Sign out
          </button>
        </header>

        {/* ─── Quotes ───────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Your quotes</h2>
            {quotes ? (
              <span className={styles.count}>{quotes.length} total</span>
            ) : null}
          </div>

          {quotes === null ? (
            <p className={styles.empty}>Loading…</p>
          ) : quotes.length === 0 ? (
            <p className={styles.empty}>
              No quotes yet. Request one from the{" "}
              <a href="/contact" style={{ color: "var(--jm-copper)" }}>
                contact page
              </a>{" "}
              and it&apos;ll show up here.
            </p>
          ) : (
            <div className={styles.list}>
              {quotes.map((quote) => (
                <article key={quote.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <h3 className={styles.rowTitle}>{quote.name}</h3>
                    <p className={styles.rowMeta}>
                      {quote.serviceType}
                      {quote.date ? ` · ${quote.date}` : ""}
                      {quote.location ? ` · ${quote.location}` : ""}
                    </p>
                  </div>

                  <div className={styles.rowActions}>
                    {quote.amountCents !== undefined ? (
                      <span className={styles.amount}>
                        {formatMoney(quote.amountCents, quote.currency)}
                      </span>
                    ) : null}
                    <span className={`jm-badge ${statusTone(quote.status)}`}>
                      {quote.status}
                    </span>
                    {isQuotePayable(quote) ? (
                      <a
                        href={quote.squarePublicUrl}
                        className="jm-btn-primary jm-btn-sm"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {quote.status === "Deposit Paid"
                          ? "Pay balance"
                          : "View & pay"}
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ─── Projects ─────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Your projects</h2>
            {projects ? (
              <span className={styles.count}>{projects.length} active</span>
            ) : null}
          </div>

          {projects === null ? (
            <p className={styles.empty}>Loading…</p>
          ) : projects.length === 0 ? (
            <p className={styles.empty}>
              Projects open automatically once a quote is paid.
            </p>
          ) : (
            <div className={styles.list}>
              {projects.map((project) => {
                const stageIndex = PROJECT_STAGES.indexOf(project.status);
                return (
                  <article key={project.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <h3 className={styles.rowTitle}>{project.name}</h3>
                      <p className={styles.rowMeta}>{project.serviceType}</p>
                    </div>

                    <span className="jm-badge jm-badge--copper">
                      {project.status}
                    </span>

                    <div className={styles.stages}>
                      {PROJECT_STAGES.map((stage, i) => (
                        <span
                          key={stage}
                          className={`${styles.stage} ${
                            i <= stageIndex ? styles.stageDone : ""
                          }`}
                        />
                      ))}
                    </div>
                    <div className={styles.stageLabels}>
                      {PROJECT_STAGES.map((stage, i) => (
                        <span
                          key={stage}
                          className={
                            i === stageIndex ? styles.stageLabelActive : ""
                          }
                        >
                          {stage}
                        </span>
                      ))}
                    </div>

                    {project.files && project.files.length > 0 ? (
                      <div className={styles.files}>
                        {project.files.map((file) => (
                          <a
                            key={file.url}
                            href={file.url}
                            className={styles.file}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            ↓ {file.name}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── Profile ──────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Your details</h2>
          </div>

          <form onSubmit={saveProfile}>
            <div className={styles.profileGrid}>
              <div className="jm-field">
                <label className="jm-label" htmlFor="p-name">
                  Name
                </label>
                <input
                  id="p-name"
                  name="name"
                  className="jm-input"
                  defaultValue={profile.name}
                  placeholder="Your name"
                />
              </div>
              <div className="jm-field">
                <label className="jm-label" htmlFor="p-phone">
                  Phone
                </label>
                <input
                  id="p-phone"
                  name="phone"
                  className="jm-input"
                  defaultValue={profile.phone ?? ""}
                  placeholder="+61 400 000 000"
                />
              </div>
            </div>
            <button type="submit" className="jm-btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save details"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
