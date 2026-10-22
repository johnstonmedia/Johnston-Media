/**
 * Filing sent mail into the inbox.
 *
 * Shared because two things send email now — the composer and the MCP server
 * — and a conversation has to be filed identically by both or a reply lands
 * on a second thread. The inbound webhook matches an incoming message on
 * sender + subject + mailbox, so those three fields are what a thread is
 * keyed on here: get them wrong and the answer to an email you sent arrives
 * as an unrelated ticket.
 */
import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import type { HelpThread } from "./emailTypes";

export interface OutboundMessage {
  /** The mailbox it went out as. */
  from: string;
  /** The one person this copy is filed against. */
  to: string;
  subject: string;
  /** Plain text — the preview, the search box and notifications read this. */
  message: string;
  /** The email as it actually went out, signature and all. */
  html?: string;
  cc?: string[];
  bcc?: string[];
  /** The person who pressed send, as opposed to the address it came from. */
  authorEmail?: string;
  authorName?: string;
  /** False when the provider refused it — it is recorded either way. */
  sent?: boolean;
}

/**
 * Records a sent email against its conversation, creating one if needed.
 *
 * Returns the thread id. Never throws: mail that has already left must not
 * be reported as failed because the filing afterwards did.
 */
export async function fileOutbound(
  db: Firestore,
  message: OutboundMessage,
): Promise<string | null> {
  const now = new Date().toISOString();
  const snippet = message.message.replace(/\s+/g, " ").slice(0, 180);

  try {
    const existing = await db
      .collection("helpThreads")
      .where("fromEmail", "==", message.to)
      .where("subject", "==", message.subject)
      .where("mailbox", "==", message.from)
      .limit(1)
      .get();

    let threadId: string;

    if (existing.empty) {
      const thread: Omit<HelpThread, "id"> = {
        subject: message.subject,
        fromEmail: message.to,
        mailbox: message.from,
        status: "Waiting",
        snippet,
        messageCount: 1,
        unread: false,
        hasOutbound: true,
        ...(message.authorName ? { lastAuthorName: message.authorName } : {}),
        ...(message.authorEmail ? { lastAuthorEmail: message.authorEmail } : {}),
        createdAt: now,
        lastMessageAt: now,
      };
      threadId = (await db.collection("helpThreads").add(thread)).id;
    } else {
      threadId = existing.docs[0].id;
      const current = existing.docs[0].data() as HelpThread;
      await existing.docs[0].ref.update({
        status: "Waiting",
        snippet,
        messageCount: (current.messageCount ?? 0) + 1,
        hasOutbound: true,
        ...(message.authorName ? { lastAuthorName: message.authorName } : {}),
        ...(message.authorEmail ? { lastAuthorEmail: message.authorEmail } : {}),
        lastMessageAt: now,
      });
    }

    await db
      .collection("helpThreads")
      .doc(threadId)
      .collection("messages")
      .add({
        direction: "out",
        fromEmail: message.from,
        toEmail: message.to,
        body: message.message,
        ...(message.html ? { html: message.html } : {}),
        ...(message.cc?.length ? { cc: message.cc } : {}),
        // Only ever on the sender's own thread, which is the point of a
        // blind copy.
        ...(message.bcc?.length ? { bcc: message.bcc } : {}),
        ...(message.authorEmail ? { authorEmail: message.authorEmail } : {}),
        ...(message.sent === false ? { failed: true } : {}),
        createdAt: now,
      });

    return threadId;
  } catch (err) {
    console.error("[mail] could not file the thread:", err);
    return null;
  }
}
