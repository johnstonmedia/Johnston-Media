"use client";

import { collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import type { ContactMessage } from "@/lib/types";

import styles from "./admin.module.css";

export default function MessagesPanel({
  onCount,
}: {
  onCount: (n: number) => void;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ContactMessage[] | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(collection(getDb(), "messages"));
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as ContactMessage,
      );
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setMessages(rows);
    } catch (err) {
      console.error("[admin] messages failed:", err);
      setMessages([]);
      toast("Could not load messages.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (messages) onCount(messages.filter((m) => !m.read).length);
  }, [messages, onCount]);

  async function markRead(message: ContactMessage) {
    try {
      await updateDoc(doc(getDb(), "messages", message.id), { read: true });
      setMessages(
        (prev) =>
          prev?.map((m) => (m.id === message.id ? { ...m, read: true } : m)) ??
          null,
      );
    } catch (err) {
      console.error("[admin] mark read failed:", err);
      toast("Could not update that message.", "error");
    }
  }

  async function remove(message: ContactMessage) {
    if (!confirm(`Delete the message from ${message.name}?`)) return;
    try {
      await deleteDoc(doc(getDb(), "messages", message.id));
      setMessages((prev) => prev?.filter((m) => m.id !== message.id) ?? null);
      toast("Message deleted.");
    } catch (err) {
      console.error("[admin] delete message failed:", err);
      toast("Could not delete that message.", "error");
    }
  }

  return (
    <section>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Messages</h2>
      </div>

      {messages === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : messages.length === 0 ? (
        <p className={styles.empty}>No messages yet.</p>
      ) : (
        <div className={styles.list}>
          {messages.map((message) => (
            <article
              key={message.id}
              className={`${styles.row} ${message.read ? "" : styles.rowUnread}`}
            >
              <div className={styles.rowMain}>
                <h3 className={styles.rowTitle}>
                  {message.name}
                  {message.read ? null : (
                    <>
                      {" "}
                      <span className="jm-badge jm-badge--copper">New</span>
                    </>
                  )}
                </h3>
                <p className={styles.rowMeta}>
                  <a
                    href={`mailto:${message.email}`}
                    style={{ color: "var(--jm-blue)" }}
                  >
                    {message.email}
                  </a>
                  {" · "}
                  {new Date(message.createdAt).toLocaleString("en-AU")}
                </p>
                <p className={styles.rowDetails}>{message.message}</p>
              </div>

              <div className={styles.rowActions}>
                <a
                  href={`mailto:${message.email}`}
                  className="jm-btn-primary jm-btn-sm"
                >
                  Reply
                </a>
                {message.read ? null : (
                  <button
                    type="button"
                    className="jm-btn-ghost jm-btn-sm"
                    onClick={() => markRead(message)}
                  >
                    Mark read
                  </button>
                )}
                <button
                  type="button"
                  className="jm-btn-ghost jm-btn-sm"
                  onClick={() => remove(message)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
