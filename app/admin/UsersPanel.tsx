"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import {
  ELEVATED_ROLES,
  OWNER_EMAIL,
  ROLES,
  type Role,
  type UserProfile,
} from "@/lib/types";

import styles from "./admin.module.css";

interface PendingClient {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  adminNotes?: string;
  createdAt: string;
}

function roleTone(role: Role): string {
  switch (role) {
    case "Owner":
      return "jm-badge--copper";
    case "Master Admin":
    case "Admin":
      return "jm-badge--teal";
    case "Client":
      return "jm-badge--success";
    default:
      return "jm-badge--muted";
  }
}

export default function UsersPanel({
  profile,
  onCount,
}: {
  profile: UserProfile;
  onCount: (n: number) => void;
}) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [pending, setPending] = useState<PendingClient[]>([]);
  const [creating, setCreating] = useState(false);

  const canManageRoles = ELEVATED_ROLES.includes(profile.role);
  const canBlockDelete =
    ELEVATED_ROLES.includes(profile.role) ||
    Boolean(profile.permissions?.blockDeleteUsers);

  const load = useCallback(async () => {
    const db = getDb();
    try {
      const [userSnap, pendingSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "pendingClients")),
      ]);

      const order = ROLES.slice().reverse() as readonly Role[];
      const rows = userSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as UserProfile,
      );
      rows.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));

      setUsers(rows);
      setPending(
        pendingSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as PendingClient,
        ),
      );
    } catch (err) {
      console.error("[admin] users failed:", err);
      setUsers([]);
      toast("Could not load clients.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (users) onCount(users.length + pending.length);
  }, [users, pending, onCount]);

  async function changeRole(user: UserProfile, role: Role) {
    if (user.email === OWNER_EMAIL) {
      toast("The Owner account can't have its role changed.", "error");
      return;
    }
    if (role === "Owner" && profile.role !== "Owner") {
      toast("Only an Owner can assign the Owner role.", "error");
      return;
    }
    try {
      await updateDoc(doc(getDb(), "users", user.id), { role });
      setUsers(
        (prev) =>
          prev?.map((u) => (u.id === user.id ? { ...u, role } : u)) ?? null,
      );
      toast(`${user.name || user.email} is now ${role}.`);
    } catch (err) {
      console.error("[admin] role change failed:", err);
      toast("Could not change that role.", "error");
    }
  }

  async function toggleBlock(user: UserProfile) {
    const blocked = !user.blocked;
    try {
      await updateDoc(doc(getDb(), "users", user.id), { blocked });
      setUsers(
        (prev) =>
          prev?.map((u) => (u.id === user.id ? { ...u, blocked } : u)) ?? null,
      );
      toast(blocked ? "User blocked." : "User unblocked.");
    } catch (err) {
      console.error("[admin] block failed:", err);
      toast("Could not update that user.", "error");
    }
  }

  async function removeUser(user: UserProfile) {
    if (!confirm(`Permanently delete ${user.email}? This cannot be undone.`))
      return;
    try {
      await deleteDoc(doc(getDb(), "users", user.id));
      setUsers((prev) => prev?.filter((u) => u.id !== user.id) ?? null);
      toast("User deleted.");
    } catch (err) {
      console.error("[admin] delete failed:", err);
      toast("Could not delete that user.", "error");
    }
  }

  async function removePending(entry: PendingClient) {
    if (!confirm(`Delete the pending profile for ${entry.email}?`)) return;
    try {
      await deleteDoc(doc(getDb(), "pendingClients", entry.id));
      setPending((prev) => prev.filter((p) => p.id !== entry.id));
      toast("Pending client removed.");
    } catch (err) {
      console.error("[admin] pending delete failed:", err);
      toast("Could not remove that profile.", "error");
    }
  }

  return (
    <section>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Clients &amp; access</h2>
        <button
          type="button"
          className="jm-btn-primary jm-btn-sm"
          onClick={() => setCreating(true)}
        >
          + Create client
        </button>
      </div>

      {pending.length > 0 ? (
        <>
          <p className={styles.groupLabel}>Pending — not yet signed in</p>
          <div className={styles.list}>
            {pending.map((entry) => (
              <article key={entry.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <h3 className={styles.rowTitle}>
                    {entry.name}{" "}
                    <span className="jm-badge jm-badge--amber">
                      Awaiting sign-in
                    </span>
                  </h3>
                  <p className={styles.rowMeta}>
                    {entry.email}
                    {entry.phone ? ` · ${entry.phone}` : ""}
                  </p>
                </div>
                <div className={styles.rowActions}>
                  <span className={`jm-badge ${roleTone(entry.role)}`}>
                    {entry.role}
                  </span>
                  <button
                    type="button"
                    className="jm-btn-ghost jm-btn-sm"
                    onClick={() => removePending(entry)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className={styles.groupLabel}>Active accounts</p>
        </>
      ) : null}

      {users === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : users.length === 0 ? (
        <p className={styles.empty}>No accounts yet.</p>
      ) : (
        <div className={styles.list}>
          {users.map((user) => {
            const isOwnerAccount = user.email === OWNER_EMAIL;
            return (
              <article key={user.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <h3 className={styles.rowTitle}>
                    {user.name || user.email}
                    {user.blocked ? (
                      <>
                        {" "}
                        <span className="jm-badge jm-badge--error">Blocked</span>
                      </>
                    ) : null}
                  </h3>
                  <p className={styles.rowMeta}>
                    {user.email}
                    {user.phone ? ` · ${user.phone}` : ""}
                  </p>
                </div>

                <div className={styles.rowActions}>
                  {canManageRoles && !isOwnerAccount ? (
                    <select
                      className="jm-select"
                      style={{ width: 150, padding: "0.45rem 2.5rem 0.45rem 0.85rem" }}
                      value={user.role}
                      onChange={(e) => changeRole(user, e.target.value as Role)}
                      aria-label={`Role for ${user.email}`}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`jm-badge ${roleTone(user.role)}`}>
                      {user.role}
                    </span>
                  )}

                  {canBlockDelete && !isOwnerAccount ? (
                    <>
                      <button
                        type="button"
                        className="jm-btn-ghost jm-btn-sm"
                        onClick={() => toggleBlock(user)}
                      >
                        {user.blocked ? "Unblock" : "Block"}
                      </button>
                      <button
                        type="button"
                        className="jm-btn-ghost jm-btn-sm"
                        onClick={() => removeUser(user)}
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {creating ? (
        <CreateClientModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Creates a client profile before they've ever signed in.
 *
 * Writes to `pendingClients/{email}` — NOT to `users/{autoId}`. Firestore's
 * users rule only allows a create where the document ID equals the caller's own
 * uid, so writing a pre-made profile there is always rejected as
 * "Missing or insufficient permissions". lib/useAuth.ts claims this record on
 * the client's first sign-in.
 */
function CreateClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const phone = String(data.get("phone") ?? "").trim();
    const role = String(data.get("role") ?? "Client") as Role;
    const adminNotes = String(data.get("notes") ?? "").trim();

    if (!name) return toast("Enter a name.", "error");
    if (!email || !email.includes("@")) return toast("Enter a valid email.", "error");

    setSaving(true);
    try {
      const db = getDb();

      // If they already have an account, update it instead of queuing a duplicate.
      const existing = await getDocs(
        query(collection(db, "users"), where("email", "==", email)),
      );

      if (!existing.empty) {
        await updateDoc(doc(db, "users", existing.docs[0].id), {
          name,
          phone,
          role,
          adminNotes,
          updatedAt: new Date().toISOString(),
        });
        toast(`Updated the existing account for ${email}.`);
      } else {
        await setDoc(doc(db, "pendingClients", email), {
          name,
          email,
          phone,
          role,
          adminNotes,
          createdAt: new Date().toISOString(),
        });
        toast(`Profile created. It links when ${email} signs in.`);
      }

      onCreated();
    } catch (err) {
      console.error("[admin] create client failed:", err);
      toast(`Could not create the client: ${(err as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="jm-modal-overlay jm-open"
      role="dialog"
      aria-modal="true"
      aria-label="Create client"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <form className="jm-modal" onSubmit={submit}>
        <div className="jm-modal-header">
          <h2 className="jm-modal-title">Create client profile</h2>
          <button
            type="button"
            className="jm-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className={styles.rowMeta} style={{ marginBottom: "1.5rem" }}>
          Set a client up before they sign up. The moment they log in with this
          email, their account links to this profile automatically.
        </p>

        <div className="jm-field">
          <label className="jm-label" htmlFor="cc-name">
            Full name
          </label>
          <input id="cc-name" name="name" className="jm-input" placeholder="Jane Smith" required />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="cc-email">
            Email address
          </label>
          <input
            id="cc-email"
            name="email"
            type="email"
            className="jm-input"
            placeholder="jane@example.com"
            required
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="cc-phone">
            Phone
          </label>
          <input
            id="cc-phone"
            name="phone"
            type="tel"
            className="jm-input"
            placeholder="+61 400 000 000"
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="cc-role">
            Role
          </label>
          <select id="cc-role" name="role" className="jm-select" defaultValue="Client">
            <option value="Prospective">Prospective</option>
            <option value="Client">Client</option>
          </select>
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="cc-notes">
            Internal notes
          </label>
          <textarea
            id="cc-notes"
            name="notes"
            className="jm-textarea"
            rows={2}
            placeholder="Anything worth remembering about this client…"
          />
        </div>

        <div className={styles.modalActions}>
          <button type="submit" className="jm-btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Create client"}
          </button>
          <button type="button" className="jm-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
