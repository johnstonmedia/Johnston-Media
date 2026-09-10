"use client";

import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import {
  DEFAULT_MAILBOXES,
  EMAIL_LEVEL_HINTS,
  EMAIL_LEVEL_LABELS,
  EMAIL_LEVELS,
  type EmailAccess,
  type EmailLevel,
  type Mailbox,
} from "@/lib/emailTypes";
import { ADMIN_ROLES, type UserProfile } from "@/lib/types";

import styles from "./email.module.css";

interface Person {
  profile: UserProfile;
  access: EmailAccess | null;
}

/**
 * Who can use the email platform, and how much.
 *
 * Reads the site's existing user base rather than keeping its own — one account
 * per person, one place to revoke it. Site admins are shown as implicitly full
 * because that's what the server actually enforces; showing them as "no access"
 * because they lack a record would be a lie the UI tells about itself.
 */
export default function AccessPanel({
  getToken,
}: {
  getToken: () => Promise<string | null>;
}) {
  const { toast } = useToast();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [level, setLevel] = useState<EmailLevel>("read");
  const [allowedFrom, setAllowedFrom] = useState<string[]>([]);
  const [primaryFrom, setPrimaryFrom] = useState("");
  const [visible, setVisible] = useState<string[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>(DEFAULT_MAILBOXES);
  const [canBroadcast, setCanBroadcast] = useState(false);
  const [maxRecipients, setMaxRecipients] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = getDb();
      const [users, grants, boxes] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "emailAccess")),
        getDocs(collection(db, "mailboxes")),
      ]);

      // Configured mailboxes win, defaults fill the gaps — the same merge the
      // inbox does, so both offer exactly the same set of addresses.
      const configured = boxes.docs.map(
        (d) => ({ address: d.id, ...d.data() }) as Mailbox,
      );
      const merged = [...configured];
      for (const fallback of DEFAULT_MAILBOXES) {
        if (!merged.some((m) => m.address === fallback.address)) {
          merged.push(fallback);
        }
      }
      merged.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      setMailboxes(merged);

      const byUid = new Map<string, EmailAccess>();
      grants.docs.forEach((d) =>
        byUid.set(d.id, { uid: d.id, ...d.data() } as EmailAccess),
      );

      setPeople(
        users.docs
          .map((d) => {
            const profile = { id: d.id, ...d.data() } as UserProfile;
            return { profile, access: byUid.get(d.id) ?? null };
          })
          .sort((a, b) => a.profile.email.localeCompare(b.profile.email)),
      );
    } catch (err) {
      console.error("[email] access list failed:", err);
      setPeople([]);
      toast("Could not load the people list.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function open(person: Person) {
    setEditing(person);
    setLevel(person.access?.level ?? "read");
    setAllowedFrom(person.access?.allowedFrom ?? []);
    setPrimaryFrom(person.access?.primaryFrom ?? "");
    setVisible(person.access?.visibleMailboxes ?? []);
    setCanBroadcast(person.access?.canBroadcast ?? false);
    setMaxRecipients(
      person.access?.maxRecipients ? String(person.access.maxRecipients) : "",
    );
  }

  async function save() {
    if (!editing || busy) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }

      const response = await fetch("/api/email/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: editing.profile.id,
          level,
          allowedFrom,
          primaryFrom,
          visibleMailboxes: visible,
          canBroadcast,
          maxRecipients,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        toast(result.error ?? "Could not save that.", "error");
        return;
      }

      toast(`${editing.profile.email} — ${EMAIL_LEVEL_LABELS[level]}.`);
      setEditing(null);
      void load();
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Access</h1>
          <p className={styles.sub}>
            Same accounts as the rest of the site, with their own level here.
            Being able to see your own invoices and being able to email four
            thousand people are not the same trust.
          </p>
        </div>
      </div>

      <div className={styles.warn}>
        The <strong>from-address list</strong> is the real control: at any level
        below full, someone can only send as an address written there. An empty
        list means none, never all.
      </div>

      {people === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : (
        <div className={styles.list}>
          {people.map((person) => {
            const isSiteAdmin = ADMIN_ROLES.includes(person.profile.role);
            const shown: EmailLevel = isSiteAdmin
              ? "admin"
              : (person.access?.level ?? "none");

            return (
              <article key={person.profile.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <h3 className={styles.rowTitle}>
                    {person.profile.name || person.profile.email}
                  </h3>
                  <p className={styles.rowMeta}>
                    {person.profile.email} · site role {person.profile.role}
                    {person.access?.allowedFrom?.length
                      ? ` · sends as ${person.access.allowedFrom.join(", ")}`
                      : ""}
                  </p>
                </div>
                <div className={styles.rowActions}>
                  <span
                    className={`jm-badge ${
                      shown === "none"
                        ? "jm-badge--muted"
                        : shown === "admin"
                          ? "jm-badge--copper"
                          : "jm-badge--teal"
                    }`}
                  >
                    {EMAIL_LEVEL_LABELS[shown]}
                  </span>
                  {isSiteAdmin ? (
                    <span className={styles.rowMeta}>via site admin</span>
                  ) : (
                    <button
                      type="button"
                      className="jm-btn-ghost jm-btn-sm"
                      onClick={() => open(person)}
                    >
                      Change
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing ? (
        <div
          className="jm-modal-overlay jm-open"
          role="dialog"
          aria-modal="true"
          aria-label="Change email access"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setEditing(null);
          }}
        >
          <div className="jm-modal" style={{ maxWidth: 520 }}>
            <div className="jm-modal-header">
              <h2 className="jm-modal-title">
                {editing.profile.name || editing.profile.email}
              </h2>
              <button
                type="button"
                className="jm-modal-close"
                onClick={() => setEditing(null)}
                disabled={busy}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="ac-level">
                Access level
              </label>
              <select
                id="ac-level"
                className="jm-select"
                value={level}
                onChange={(e) => setLevel(e.target.value as EmailLevel)}
              >
                {EMAIL_LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {EMAIL_LEVEL_LABELS[option]}
                  </option>
                ))}
              </select>
              <p className={styles.rowMeta} style={{ marginTop: "0.5rem" }}>
                {EMAIL_LEVEL_HINTS[level]}
              </p>
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="ac-primary">
                Their address
              </label>
              <select
                id="ac-primary"
                className="jm-select"
                value={primaryFrom}
                onChange={(e) => {
                  const next = e.target.value;
                  setPrimaryFrom(next);
                  // Their own address is always one they may send as; letting
                  // the two drift apart is how you get a person whose default
                  // From is refused the moment they press send.
                  if (next && !allowedFrom.includes(next)) {
                    setAllowedFrom([...allowedFrom, next]);
                  }
                }}
              >
                <option value="">No address of their own</option>
                {mailboxes.map((box) => (
                  <option key={box.address} value={box.address}>
                    {box.label} — {box.address}
                  </option>
                ))}
              </select>
              <p className={styles.rowMeta} style={{ marginTop: "0.5rem" }}>
                Pre-selected when they write. Marketing for whoever runs
                campaigns, their own name for someone corresponding as
                themselves.
              </p>
            </div>

            <div className="jm-field">
              <span className="jm-label">May send as</span>
              <div className={styles.tickList}>
                {mailboxes.map((box) => (
                  <label key={box.address} className={styles.tick}>
                    <input
                      type="checkbox"
                      checked={allowedFrom.includes(box.address)}
                      // Unticking the primary would leave them defaulting to
                      // an address they can't use, so that one is held.
                      disabled={box.address === primaryFrom}
                      onChange={(e) =>
                        setAllowedFrom(
                          e.target.checked
                            ? [...allowedFrom, box.address]
                            : allowedFrom.filter((a) => a !== box.address),
                        )
                      }
                    />
                    <span>
                      <strong>{box.label}</strong>
                      <em>{box.address}</em>
                    </span>
                  </label>
                ))}
              </div>
              {level !== "admin" && allowedFrom.length === 0 ? (
                <p className={styles.rowMeta} style={{ marginTop: "0.5rem" }}>
                  Nothing ticked means they can send as nothing at all — which
                  is the safe reading of an empty list, not a shortcut for
                  &ldquo;any address&rdquo;.
                </p>
              ) : null}
            </div>

            <div className="jm-field">
              <span className="jm-label">May read</span>
              <div className={styles.tickList}>
                {mailboxes.map((box) => (
                  <label key={box.address} className={styles.tick}>
                    <input
                      type="checkbox"
                      checked={visible.includes(box.address)}
                      onChange={(e) =>
                        setVisible(
                          e.target.checked
                            ? [...visible, box.address]
                            : visible.filter((a) => a !== box.address),
                        )
                      }
                    />
                    <span>
                      <strong>{box.label}</strong>
                      <em>{box.address}</em>
                    </span>
                  </label>
                ))}
              </div>
              <p className={styles.rowMeta} style={{ marginTop: "0.5rem" }}>
                {visible.length === 0
                  ? "Nothing ticked means every mailbox — the way it worked before this setting existed."
                  : `They will see ${visible.length} of ${mailboxes.length} mailboxes and nothing else.`}
              </p>
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="ac-max">
                Most recipients per send
              </label>
              <input
                id="ac-max"
                className="jm-input"
                type="number"
                min="1"
                value={maxRecipients}
                placeholder="500"
                onChange={(e) => setMaxRecipients(e.target.value)}
              />
            </div>

            <label
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-start",
                fontSize: "var(--text-sm)",
                color: "var(--jm-white)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={canBroadcast}
                onChange={(e) => setCanBroadcast(e.target.checked)}
                style={{ marginTop: "0.2rem", accentColor: "var(--jm-copper)" }}
              />
              <span>
                May send to a whole audience
                <em
                  style={{
                    display: "block",
                    fontStyle: "normal",
                    fontSize: "var(--text-xs)",
                    color: "var(--jm-slate)",
                    marginTop: "0.2rem",
                  }}
                >
                  Off means they can write and test, but a real broadcast is
                  refused.
                </em>
              </span>
            </label>

            <div className={styles.actions} style={{ marginTop: "var(--space-lg)" }}>
              <button
                type="button"
                className="jm-btn-primary"
                onClick={save}
                disabled={busy}
              >
                {busy ? "Saving…" : "Save access"}
              </button>
              <button
                type="button"
                className="jm-btn-ghost"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
