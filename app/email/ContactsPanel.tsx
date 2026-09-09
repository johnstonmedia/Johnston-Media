"use client";

import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import { atLeast, type Contact, type EmailAccess } from "@/lib/emailTypes";

import styles from "./email.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 450;

/** Contact id from the address, so importing twice can't duplicate anyone. */
function idFor(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 200);
}

export default function ContactsPanel({ access }: { access: EmailAccess }) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "subscribed" | "unsubscribed">(
    "subscribed",
  );
  const [paste, setPaste] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const canEdit = atLeast(access.level, "draft");

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(
        query(
          collection(getDb(), "contacts"),
          orderBy("createdAt", "desc"),
          limit(500),
        ),
      );
      setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Contact));
    } catch (err) {
      console.error("[email] contacts failed:", err);
      setContacts([]);
      toast("Could not load contacts.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Imports pasted addresses.
   *
   * Accepts "name <email>", "email,name" or one address per line, because a
   * list arrives in whatever shape the last tool exported it in. Existing
   * contacts are merged rather than replaced, so an import can never silently
   * resubscribe somebody who opted out.
   */
  async function importPaste() {
    const lines = paste
      .split(/[\n,;]+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast("Paste some addresses first.", "error");
      return;
    }

    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const parsed: { email: string; name?: string }[] = [];
    const rejected: string[] = [];

    for (const line of lines) {
      const angled = line.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
      const email = (angled ? angled[2] : line).trim().toLowerCase();
      const name = angled?.[1]?.replace(/^"|"$/g, "").trim() || undefined;
      if (!EMAIL_RE.test(email)) {
        rejected.push(line);
        continue;
      }
      parsed.push({ email, name });
    }

    if (parsed.length === 0) {
      toast("None of those looked like email addresses.", "error");
      return;
    }

    setBusy(true);
    try {
      const db = getDb();
      let written = 0;

      for (let i = 0; i < parsed.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const entry of parsed.slice(i, i + BATCH_LIMIT)) {
          const ref = doc(db, "contacts", idFor(entry.email));
          // merge:true so re-importing keeps an existing unsubscribe.
          batch.set(
            ref,
            {
              email: entry.email,
              ...(entry.name ? { name: entry.name } : {}),
              tags: tagList,
              source: "import",
              createdAt: new Date().toISOString(),
            },
            { merge: true },
          );
          written += 1;
        }
        await batch.commit();
      }

      // Anyone genuinely new starts subscribed; anyone existing keeps their
      // state, which is why this is a second pass rather than part of the merge.
      const existing = new Set(contacts?.map((c) => c.id) ?? []);
      const fresh = parsed.filter((e) => !existing.has(idFor(e.email)));
      for (let i = 0; i < fresh.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const entry of fresh.slice(i, i + BATCH_LIMIT)) {
          batch.set(
            doc(db, "contacts", idFor(entry.email)),
            { subscribed: true },
            { merge: true },
          );
        }
        await batch.commit();
      }

      setPaste("");
      toast(
        rejected.length
          ? `${written} added. ${rejected.length} skipped — not valid addresses.`
          : `${written} contacts added.`,
      );
      void load();
    } catch (err) {
      console.error("[email] import failed:", err);
      toast("The import failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSubscribed(contact: Contact) {
    try {
      await updateDoc(doc(getDb(), "contacts", contact.id), {
        subscribed: !contact.subscribed,
        ...(contact.subscribed
          ? { unsubscribedAt: new Date().toISOString() }
          : {}),
      });
      setContacts(
        (prev) =>
          prev?.map((c) =>
            c.id === contact.id ? { ...c, subscribed: !c.subscribed } : c,
          ) ?? null,
      );
    } catch {
      toast("Could not change that.", "error");
    }
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (contacts ?? [])
      .filter((c) =>
        filter === "all"
          ? true
          : filter === "subscribed"
            ? c.subscribed
            : !c.subscribed,
      )
      .filter(
        (c) =>
          !term ||
          c.email.includes(term) ||
          c.name?.toLowerCase().includes(term) ||
          c.tags?.some((t) => t.toLowerCase().includes(term)),
      );
  }, [contacts, filter, search]);

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Contacts</h1>
          <p className={styles.sub}>
            Everyone who might hear from you. Unsubscribes are kept, never
            deleted — that record is how the promise gets honoured next time.
          </p>
        </div>
      </div>

      {canEdit ? (
        <div className={styles.card} style={{ marginBottom: "var(--space-lg)" }}>
          <h3 className={styles.cardTitle}>Add people</h3>
          <div className="jm-field">
            <textarea
              className="jm-textarea"
              rows={3}
              value={paste}
              placeholder={'One per line: jane@example.com, or "Jane Doe <jane@example.com>"'}
              onChange={(e) => setPaste(e.target.value)}
            />
          </div>
          <div className={styles.field2}>
            <div className="jm-field">
              <label className="jm-label" htmlFor="ct-tags">
                Tag them (comma separated)
              </label>
              <input
                id="ct-tags"
                className="jm-input"
                value={tags}
                placeholder="clients, newsletter"
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                type="button"
                className="jm-btn-primary jm-btn-sm"
                onClick={importPaste}
                disabled={busy}
              >
                {busy ? "Adding…" : "Add contacts"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.field2} style={{ marginBottom: "var(--space-md)" }}>
        <div className="jm-field">
          <input
            className="jm-input"
            value={search}
            placeholder="Search name, address or tag"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="jm-field">
          <select
            className="jm-select"
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as "all" | "subscribed" | "unsubscribed")
            }
          >
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="all">Everyone</option>
          </select>
        </div>
      </div>

      {contacts === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          <strong>Nobody here</strong>
          {contacts.length === 0
            ? "Paste a list in above to get started."
            : "Nothing matches that filter."}
        </div>
      ) : (
        <div className={styles.list}>
          {visible.slice(0, 200).map((contact) => (
            <article key={contact.id} className={styles.row}>
              <div className={styles.rowMain}>
                <h3 className={styles.rowTitle}>
                  {contact.name || contact.email}
                </h3>
                <p className={styles.rowMeta}>
                  {contact.name ? `${contact.email} · ` : ""}
                  {contact.tags?.length ? contact.tags.join(", ") : "no tags"}
                  {contact.bounced ? " · bounced" : ""}
                </p>
              </div>
              <div className={styles.rowActions}>
                <span
                  className={`jm-badge ${
                    contact.subscribed ? "jm-badge--success" : "jm-badge--muted"
                  }`}
                >
                  {contact.subscribed ? "Subscribed" : "Unsubscribed"}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="jm-btn-ghost jm-btn-sm"
                    onClick={() => toggleSubscribed(contact)}
                  >
                    {contact.subscribed ? "Remove" : "Resubscribe"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {visible.length > 200 ? (
            <p className={styles.rowMeta}>
              Showing the first 200 of {visible.length}. Narrow the search to
              find someone specific.
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
