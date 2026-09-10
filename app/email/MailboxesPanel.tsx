"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import { DEFAULT_MAILBOXES, type Mailbox } from "@/lib/emailTypes";

import styles from "./email.module.css";

/**
 * The addresses the platform sorts mail into.
 *
 * Mailboxes were always meant to be data rather than code — every incoming
 * message records which address it arrived at, and the inbox groups on that —
 * but until now the only way to add one was to edit DEFAULT_MAILBOXES and
 * deploy. This is the missing half: the defaults are what a fresh install
 * starts with, and anything saved here overrides them.
 *
 * A row here is not, on its own, a working address. The address also has to
 * exist at the mail host and forward to /api/email/inbound, and its domain has
 * to be verified in Resend before anything can go out from it. The panel says
 * so rather than letting a saved row imply mail will arrive.
 */
export default function MailboxesPanel() {
  const { toast } = useToast();
  const [boxes, setBoxes] = useState<Mailbox[] | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Mailbox | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(collection(getDb(), "mailboxes"));
      const rows = snap.docs.map(
        (d) => ({ address: d.id, ...d.data() }) as Mailbox,
      );
      setSaved(new Set(rows.map((m) => m.address)));

      // Saved rows win; the defaults fill the gaps, so this list is exactly
      // what the inbox rail will show.
      const merged = [...rows];
      for (const fallback of DEFAULT_MAILBOXES) {
        if (!merged.some((m) => m.address === fallback.address)) {
          merged.push(fallback);
        }
      }
      merged.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      setBoxes(merged);
    } catch {
      toast("Couldn't load mailboxes.", "error");
      setBoxes([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function open(box: Mailbox, fresh: boolean) {
    setIsNew(fresh);
    setEditing({ ...box });
  }

  async function save() {
    if (!editing) return;
    const address = editing.address.trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      toast("That doesn't look like an email address.", "error");
      return;
    }
    if (!editing.label.trim()) {
      toast("Give it a short label — that's what the rail shows.", "error");
      return;
    }
    if (isNew && boxes?.some((m) => m.address === address)) {
      toast(`${address} is already a mailbox.`, "error");
      return;
    }

    setBusy(true);
    try {
      await setDoc(
        doc(getDb(), "mailboxes", address),
        {
          label: editing.label.trim(),
          description: editing.description?.trim() ?? "",
          fromName: editing.fromName?.trim() ?? "",
          order: Number(editing.order) || 99,
          createdAt: new Date().toISOString(),
        },
        { merge: true },
      );
      toast(`Saved ${address}.`, "success");
      setEditing(null);
      void load();
    } catch {
      toast("Couldn't save that — admin access is required.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(box: Mailbox) {
    setBusy(true);
    try {
      await deleteDoc(doc(getDb(), "mailboxes", box.address));
      toast(`Removed ${box.address}.`, "success");
      void load();
    } catch {
      toast("Couldn't remove that.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Mailboxes</h1>
          <p className={styles.sub}>
            Every address the platform knows about. Conversations are grouped by
            the address they arrived at, so adding one here gives it its own
            place in the inbox.
          </p>
        </div>
        <button
          type="button"
          className="jm-btn-primary jm-btn-sm"
          onClick={() =>
            open(
              {
                address: "",
                label: "",
                description: "",
                fromName: "",
                order: (boxes?.length ?? 0) + 1,
              },
              true,
            )
          }
        >
          Add a mailbox
        </button>
      </div>

      <div className={styles.warn}>
        A row here is half of a working address. The address also has to exist
        at your mail host and forward to <strong>/api/email/inbound</strong>,
        and its domain has to be verified in Resend before you can send from it.
      </div>

      {boxes === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : (
        <div className={styles.list}>
          {boxes.map((box) => (
            <article key={box.address} className={styles.row}>
              <div className={styles.rowMain}>
                <h3 className={styles.rowTitle}>{box.label}</h3>
                <p className={styles.rowMeta}>
                  {box.address}
                  {box.description ? ` · ${box.description}` : ""}
                  {box.fromName ? ` · replies as ${box.fromName}` : ""}
                </p>
              </div>
              <div className={styles.rowActions}>
                <span
                  className={`jm-badge ${
                    saved.has(box.address)
                      ? "jm-badge--teal"
                      : "jm-badge--muted"
                  }`}
                >
                  {saved.has(box.address) ? "Configured" : "Built in"}
                </span>
                <button
                  type="button"
                  className="jm-btn-ghost jm-btn-sm"
                  onClick={() => open(box, false)}
                >
                  Edit
                </button>
                {saved.has(box.address) ? (
                  <button
                    type="button"
                    className="jm-btn-ghost jm-btn-sm"
                    onClick={() => void remove(box)}
                    disabled={busy}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {editing ? (
        <div
          className="jm-modal-overlay jm-open"
          role="dialog"
          aria-modal="true"
          aria-label="Edit mailbox"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setEditing(null);
          }}
        >
          <div className="jm-modal" style={{ maxWidth: 520 }}>
            <div className="jm-modal-header">
              <h2 className="jm-modal-title">
                {isNew ? "New mailbox" : editing.address}
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
              <label className="jm-label" htmlFor="mb-address">
                Address
              </label>
              <input
                id="mb-address"
                className="jm-input"
                value={editing.address}
                // The address is the document id, and threads point at it by
                // name — editing it on an existing mailbox would orphan its
                // mail rather than rename it.
                disabled={!isNew}
                onChange={(e) =>
                  setEditing({ ...editing, address: e.target.value })
                }
                placeholder="bookings@wjohnstonmedia.com"
              />
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="mb-label">
                Label
              </label>
              <input
                id="mb-label"
                className="jm-input"
                value={editing.label}
                onChange={(e) =>
                  setEditing({ ...editing, label: e.target.value })
                }
                placeholder="Bookings"
              />
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="mb-desc">
                Description
              </label>
              <input
                id="mb-desc"
                className="jm-input"
                value={editing.description ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
                placeholder="Shown under the label in the rail"
              />
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="mb-from">
                Replies go out as
              </label>
              <input
                id="mb-from"
                className="jm-input"
                value={editing.fromName ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, fromName: e.target.value })
                }
                placeholder="Johnston Media Bookings"
              />
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="mb-order">
                Order in the rail
              </label>
              <input
                id="mb-order"
                className="jm-input"
                type="number"
                min={1}
                value={editing.order ?? 99}
                onChange={(e) =>
                  setEditing({ ...editing, order: Number(e.target.value) })
                }
              />
            </div>

            <div
              className={styles.actions}
              style={{ marginTop: "var(--space-lg)" }}
            >
              <button
                type="button"
                className="jm-btn-primary"
                onClick={save}
                disabled={busy}
              >
                {busy ? "Saving…" : "Save mailbox"}
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
