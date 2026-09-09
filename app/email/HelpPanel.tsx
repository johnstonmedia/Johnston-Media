"use client";

import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import {
  atLeast,
  type EmailAccess,
  type HelpMessage,
  type HelpThread,
} from "@/lib/emailTypes";

import styles from "./email.module.css";

const HELP_ADDRESS =
  process.env.NEXT_PUBLIC_EMAIL_HELP ?? "help@wjohnstonmedia.com";

function statusTone(status: HelpThread["status"]): string {
  if (status === "Open") return "jm-badge--copper";
  if (status === "Waiting") return "jm-badge--amber";
  return "jm-badge--muted";
}

/**
 * The help desk: everything sent to help@, as conversations.
 *
 * Replies go out through the API rather than a mail client so the thread keeps
 * the whole exchange — the next person to open it can see what was already
 * said, which is the entire reason for having a shared inbox instead of
 * forwarding things around.
 */
export default function HelpPanel({
  access,
  getToken,
  onCount,
}: {
  access: EmailAccess;
  getToken: () => Promise<string | null>;
  onCount: (n: number) => void;
}) {
  const { toast } = useToast();
  const [threads, setThreads] = useState<HelpThread[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<HelpMessage[] | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const canReply = atLeast(access.level, "draft");

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(
        query(
          collection(getDb(), "helpThreads"),
          orderBy("lastMessageAt", "desc"),
          limit(200),
        ),
      );
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as HelpThread,
      );
      setThreads(rows);
      onCount(rows.filter((t) => t.status === "Open").length);
    } catch (err) {
      console.error("[email] help threads failed:", err);
      setThreads([]);
      toast("Could not load the help inbox.", "error");
    }
  }, [toast, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const openThread = useCallback(
    async (thread: HelpThread) => {
      setOpenId(thread.id);
      setMessages(null);
      setReply("");
      try {
        const snap = await getDocs(
          query(
            collection(getDb(), "helpThreads", thread.id, "messages"),
            orderBy("createdAt", "asc"),
          ),
        );
        setMessages(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HelpMessage),
        );
        if (thread.unread) {
          await updateDoc(doc(getDb(), "helpThreads", thread.id), {
            unread: false,
          });
          setThreads(
            (prev) =>
              prev?.map((t) =>
                t.id === thread.id ? { ...t, unread: false } : t,
              ) ?? null,
          );
        }
      } catch (err) {
        console.error("[email] thread failed:", err);
        setMessages([]);
      }
    },
    [],
  );

  async function send(close: boolean) {
    if (!openId || !reply.trim() || busy) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }

      const response = await fetch("/api/email/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ threadId: openId, message: reply, close }),
      });
      const result = await response.json();

      if (!response.ok) {
        toast(result.error ?? "Could not send that reply.", "error");
        return;
      }

      toast(
        result.emailed
          ? close
            ? "Replied and closed."
            : "Reply sent."
          : "Saved, but the email didn't send — check Resend.",
        result.emailed ? "success" : "error",
      );
      setReply("");
      void load();
      const current = threads?.find((t) => t.id === openId);
      if (current) void openThread(current);
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  const visible = (threads ?? []).filter((t) =>
    filter === "open" ? t.status !== "Closed" : true,
  );
  const current = threads?.find((t) => t.id === openId) ?? null;

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Help inbox</h1>
          <p className={styles.sub}>
            Everything sent to <strong>{HELP_ADDRESS}</strong>, as
            conversations. Replies go from the same address, so the thread stays
            whole on their side too.
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className="jm-btn-ghost jm-btn-sm"
            onClick={() => setFilter(filter === "open" ? "all" : "open")}
          >
            {filter === "open" ? "Show closed too" : "Hide closed"}
          </button>
        </div>
      </div>

      {threads !== null && threads.length === 0 ? (
        <div className={styles.empty}>
          <strong>Nothing in the inbox</strong>
          Once {HELP_ADDRESS} is pointed at this platform, messages land here as
          conversations. See the README for the forwarding setup.
        </div>
      ) : (
        <div className={styles.inbox}>
          <div className={styles.list}>
            {threads === null ? (
              <p className={styles.empty}>Loading…</p>
            ) : visible.length === 0 ? (
              <p className={styles.empty}>Nothing open. Good.</p>
            ) : (
              visible.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`${styles.row} ${thread.unread ? styles.rowUnread : ""}`}
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    borderColor:
                      openId === thread.id
                        ? "var(--jm-copper)"
                        : undefined,
                  }}
                  onClick={() => openThread(thread)}
                >
                  <div className={styles.rowMain}>
                    <h3 className={styles.rowTitle}>{thread.subject}</h3>
                    <p className={styles.rowMeta}>
                      {thread.fromName || thread.fromEmail} ·{" "}
                      {new Date(thread.lastMessageAt).toLocaleDateString("en-AU")}
                      <br />
                      {thread.snippet}
                    </p>
                  </div>
                  <span className={`jm-badge ${statusTone(thread.status)}`}>
                    {thread.status}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className={styles.card}>
            {!current ? (
              <p className={styles.rowMeta}>
                Pick a conversation to read it.
              </p>
            ) : (
              <>
                <h3 className={styles.rowTitle}>{current.subject}</h3>
                <p className={styles.rowMeta} style={{ marginBottom: "1rem" }}>
                  {current.fromName
                    ? `${current.fromName} · ${current.fromEmail}`
                    : current.fromEmail}
                </p>

                <div className={styles.thread}>
                  {messages === null ? (
                    <p className={styles.rowMeta}>Loading…</p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`${styles.bubble} ${
                          message.direction === "out" ? styles.bubbleOut : ""
                        }`}
                      >
                        <span className={styles.bubbleWho}>
                          {message.direction === "out"
                            ? `You · ${message.authorEmail ?? ""}`
                            : message.fromName || message.fromEmail}
                        </span>
                        {message.body}
                      </div>
                    ))
                  )}
                </div>

                {canReply ? (
                  <div style={{ marginTop: "var(--space-md)" }}>
                    <div className="jm-field">
                      <label className="jm-label" htmlFor="h-reply">
                        Reply
                      </label>
                      <textarea
                        id="h-reply"
                        className="jm-textarea"
                        rows={5}
                        value={reply}
                        placeholder="Write it the way you'd say it."
                        onChange={(e) => setReply(e.target.value)}
                      />
                    </div>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className="jm-btn-primary jm-btn-sm"
                        onClick={() => send(false)}
                        disabled={busy || !reply.trim()}
                      >
                        {busy ? "Sending…" : "Send reply"}
                      </button>
                      <button
                        type="button"
                        className="jm-btn-ghost jm-btn-sm"
                        onClick={() => send(true)}
                        disabled={busy || !reply.trim()}
                      >
                        Reply and close
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={styles.rowMeta} style={{ marginTop: "1rem" }}>
                    You have read-only access, so you can follow the
                    conversation but not reply.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
