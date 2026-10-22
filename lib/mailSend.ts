/**
 * Sending a plain email, end to end.
 *
 * The composer has its own path because it also wraps templates; this is the
 * simple case — a typed message, in the house shell, out through Resend and
 * filed against its conversation. The MCP server uses it, and so does
 * anything else that needs to send mail without a form in front of it.
 */
import "server-only";

import { plainShell } from "./emailSignature";
import { adminDb } from "./firebaseAdmin";
import { fileOutbound } from "./mailThreads";

const KEY = process.env.RESEND_API_KEY;
const SENDER_ADDRESS =
  process.env.EMAIL_SENDER_ADDRESS ?? "New South Wales, Australia";

/** Shared escaping, so nothing typed into a message ships as markup. */
function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Plain text into paragraphs, the way a typed message reads. */
export function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="margin:0 0 16px 0">${escape(block).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

/** The display name this mailbox sends under. */
export async function nameFor(mailbox: string): Promise<string> {
  try {
    const snap = await adminDb().collection("mailboxes").doc(mailbox).get();
    const name = snap.exists ? (snap.data()?.fromName as string | undefined) : undefined;
    return name || "Johnston Media";
  } catch {
    // A missing mailbox record is not a reason to refuse to send.
    return "Johnston Media";
  }
}

export interface SendPlainMail {
  /** The mailbox it goes out as. Must be one that exists. */
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  /** Who pressed send, recorded on the thread. */
  authorEmail?: string;
  authorName?: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
  /** One per person in `to`, for linking straight to the conversation. */
  threadIds: string[];
}

/**
 * Sends one message and files it.
 *
 * Everyone in `to` is on the same message and can see each other, which is
 * what someone means when they list several recipients and add a copy. The
 * conversation is filed once per person, because their replies will come
 * back separately.
 */
export async function sendPlainMail(
  options: SendPlainMail,
): Promise<SendResult> {
  if (!KEY) {
    return { ok: false, error: "RESEND_API_KEY is not set.", threadIds: [] };
  }

  const fromName = await nameFor(options.from);
  const html = plainShell(paragraphs(options.message), options.subject, {
    fromName,
    fromEmail: options.from,
    senderAddress: SENDER_ADDRESS,
  });

  let ok = false;
  let error: string | undefined;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${options.from}>`,
        to: options.to,
        ...(options.cc?.length ? { cc: options.cc } : {}),
        ...(options.bcc?.length ? { bcc: options.bcc } : {}),
        subject: options.subject,
        reply_to: options.from,
        text: options.message,
        html,
      }),
    });

    ok = response.ok;
    // The provider's own words. An unverified domain and a wrong key look
    // identical until you can read the response.
    if (!ok) error = (await response.text()).slice(0, 300);
  } catch (err) {
    error = err instanceof Error ? err.message : "network error";
  }

  const db = adminDb();
  const threadIds: string[] = [];
  for (const person of options.to) {
    const id = await fileOutbound(db, {
      from: options.from,
      to: person,
      subject: options.subject,
      message: options.message,
      html,
      cc: options.cc,
      bcc: options.bcc,
      authorEmail: options.authorEmail,
      authorName: options.authorName,
      sent: ok,
    });
    if (id) threadIds.push(id);
  }

  return { ok, error, threadIds };
}
