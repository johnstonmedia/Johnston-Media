"use client";

import { useState } from "react";

import type { EmailDraft, HelpThread } from "@/lib/emailTypes";

import styles from "./email.module.css";
import { useAutosave } from "./useAutosave";

export interface ReplyPayload {
  message: string;
  cc: string;
  bcc: string;
  close: boolean;
}

/**
 * The reply box at the bottom of a conversation.
 *
 * Its own component for one reason that matters: it is mounted with the
 * conversation's id as a key, so moving between threads gives each one a
 * fresh box and a fresh draft. Sharing one box across conversations is how
 * half an answer to one person ends up saved against someone else's thread.
 *
 * It owns what is typed, so the panel around it never has to re-render while
 * somebody writes.
 */
export default function ReplyBox({
  thread,
  mailbox,
  draft,
  getToken,
  busy,
  onSend,
}: {
  thread: HelpThread;
  /** The address the reply goes out as. */
  mailbox: string;
  /** Anything half-written from last time. */
  draft: EmailDraft | null;
  getToken: () => Promise<string | null>;
  busy: boolean;
  /** Resolves true when it actually went. */
  onSend: (payload: ReplyPayload) => Promise<boolean>;
}) {
  const [message, setMessage] = useState(draft?.message ?? "");
  const [cc, setCc] = useState(draft?.cc ?? "");
  const [bcc, setBcc] = useState(draft?.bcc ?? "");
  const [showCopies, setShowCopies] = useState(
    Boolean(draft?.cc || draft?.bcc),
  );

  const autosave = useAutosave(
    {
      kind: "reply",
      threadId: thread.id,
      threadSubject: thread.subject,
      from: mailbox,
      to: thread.fromEmail,
      cc,
      bcc,
      message,
    },
    getToken,
    { id: draft?.id ?? null },
  );

  async function send(close: boolean) {
    if (busy || !message.trim()) return;
    const sent = await onSend({ message, cc, bcc, close });
    if (!sent) return;
    // Sent is no longer a draft.
    setMessage("");
    setCc("");
    setBcc("");
    await autosave.discard();
  }

  return (
    <footer className={styles.composeBar}>
      {showCopies ? (
        <div className={styles.replyCopies}>
          <input
            className={styles.composeBox}
            value={cc}
            placeholder="Cc — everyone on the reply can see these"
            onChange={(e) => setCc(e.target.value)}
            aria-label="Cc"
          />
          <input
            className={styles.composeBox}
            value={bcc}
            placeholder="Bcc — nobody on the reply can see these"
            onChange={(e) => setBcc(e.target.value)}
            aria-label="Bcc"
          />
        </div>
      ) : null}

      <textarea
        className={styles.composeBox}
        rows={3}
        value={message}
        placeholder={`Reply from ${mailbox}…`}
        onChange={(e) => setMessage(e.target.value)}
      />

      <div className={styles.composeActions}>
        <button
          type="button"
          className="jm-btn-primary jm-btn-sm"
          onClick={() => send(false)}
          disabled={busy || !message.trim()}
        >
          {busy ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          className="jm-btn-ghost jm-btn-sm"
          onClick={() => send(true)}
          disabled={busy || !message.trim()}
        >
          Send &amp; done
        </button>
        {!showCopies ? (
          <button
            type="button"
            className={styles.ccToggle}
            onClick={() => setShowCopies(true)}
          >
            Cc / Bcc
          </button>
        ) : null}

        <span className={styles.saveState} aria-live="polite">
          {autosave.state === "saving"
            ? "Saving…"
            : autosave.state === "failed"
              ? "Not saved — check your connection"
              : autosave.state === "saved"
                ? "Saved to Drafts"
                : ""}
        </span>
      </div>
    </footer>
  );
}
