"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import {
  atLeast,
  type Audience,
  type Contact,
  type EmailAccess,
} from "@/lib/emailTypes";

import styles from "./email.module.css";

/**
 * Audiences are tag rules, not saved lists.
 *
 * A stored list goes stale the moment somebody new is tagged; a rule is
 * evaluated at send time, so "clients" always means whoever is a client today.
 */
export default function AudiencePanel({ access }: { access: EmailAccess }) {
  const { toast } = useToast();
  const [audiences, setAudiences] = useState<Audience[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const canEdit = atLeast(access.level, "draft");

  const load = useCallback(async () => {
    try {
      const db = getDb();
      const [auds, cons] = await Promise.all([
        getDocs(collection(db, "audiences")),
        getDocs(collection(db, "contacts")),
      ]);
      setAudiences(auds.docs.map((d) => ({ id: d.id, ...d.data() }) as Audience));
      setContacts(cons.docs.map((d) => ({ id: d.id, ...d.data() }) as Contact));
    } catch (err) {
      console.error("[email] audiences failed:", err);
      setAudiences([]);
      toast("Could not load audiences.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /** How many subscribed people this rule matches right now. */
  function sizeOf(audience: Audience): number {
    return contacts.filter(
      (c) =>
        c.subscribed &&
        !c.bounced &&
        audience.tags.every((tag) => c.tags?.includes(tag)),
    ).length;
  }

  const allTags = Array.from(
    new Set(contacts.flatMap((c) => c.tags ?? [])),
  ).sort();

  async function create() {
    if (!name.trim()) {
      toast("Give the audience a name.", "error");
      return;
    }
    setBusy(true);
    try {
      const audience: Omit<Audience, "id"> = {
        name: name.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        createdAt: new Date().toISOString(),
        createdBy: access.email,
      };
      await addDoc(collection(getDb(), "audiences"), audience);
      setName("");
      setTags("");
      toast("Audience created.");
      void load();
    } catch {
      toast("Could not create that.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(audience: Audience) {
    if (!window.confirm(`Delete the audience “${audience.name}”?`)) return;
    try {
      await deleteDoc(doc(getDb(), "audiences", audience.id));
      setAudiences((prev) => prev?.filter((a) => a.id !== audience.id) ?? null);
      toast("Deleted. The contacts themselves are untouched.");
    } catch {
      toast("Could not delete that.", "error");
    }
  }

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Audiences</h1>
          <p className={styles.sub}>
            A rule, not a snapshot: an audience is “everyone subscribed who has
            all of these tags”, worked out fresh each time you send.
          </p>
        </div>
      </div>

      {canEdit ? (
        <div className={styles.card} style={{ marginBottom: "var(--space-lg)" }}>
          <h3 className={styles.cardTitle}>New audience</h3>
          <div className={styles.field2}>
            <div className="jm-field">
              <label className="jm-label" htmlFor="a-name">
                Name
              </label>
              <input
                id="a-name"
                className="jm-input"
                value={name}
                placeholder="Past clients"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="jm-field">
              <label className="jm-label" htmlFor="a-tags">
                Must have all these tags
              </label>
              <input
                id="a-tags"
                className="jm-input"
                value={tags}
                placeholder="clients, nsw"
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
          </div>
          {allTags.length > 0 ? (
            <p className={styles.rowMeta} style={{ marginBottom: "0.75rem" }}>
              Tags in use: {allTags.join(", ")}
            </p>
          ) : null}
          <button
            type="button"
            className="jm-btn-primary jm-btn-sm"
            onClick={create}
            disabled={busy}
          >
            {busy ? "Creating…" : "Create audience"}
          </button>
        </div>
      ) : null}

      {audiences === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : audiences.length === 0 ? (
        <div className={styles.empty}>
          <strong>No audiences yet</strong>
          Without one, a campaign goes to everyone who is subscribed.
        </div>
      ) : (
        <div className={styles.list}>
          {audiences.map((audience) => (
            <article key={audience.id} className={styles.row}>
              <div className={styles.rowMain}>
                <h3 className={styles.rowTitle}>{audience.name}</h3>
                <p className={styles.rowMeta}>
                  {audience.tags.length
                    ? `Tagged ${audience.tags.join(" + ")}`
                    : "Everyone subscribed"}
                </p>
              </div>
              <div className={styles.rowActions}>
                <span className="jm-badge jm-badge--teal">
                  {sizeOf(audience).toLocaleString("en-AU")} people
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="jm-btn-ghost jm-btn-sm"
                    onClick={() => remove(audience)}
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
