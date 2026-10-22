import { NextResponse } from "next/server";

import { requireEmailLevel } from "@/lib/emailAccess";
import type { HelpThread } from "@/lib/emailTypes";
import { adminDb } from "@/lib/firebaseAdmin";
import { plainShell } from "@/lib/emailSignature";
import { clean, cleanMultiline } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.RESEND_API_KEY;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENDER_ADDRESS =
  process.env.EMAIL_SENDER_ADDRESS ?? "New South Wales, Australia";
const HELP_FROM =
  process.env.EMAIL_HELP_FROM ?? "Johnston Media Help <help@wjohnstonmedia.com>";

/**
 * Replies go out from the address the message arrived at.
 *
 * Someone who wrote to hello@ should get an answer from hello@, not from a
 * support address they've never seen — the reply belongs to the conversation
 * they started, and a different sender breaks the thread in their client.
 */
async function senderFor(
  mailbox: string | undefined,
): Promise<{ header: string; name: string; email: string }> {
  if (!mailbox) {
    const match = HELP_FROM.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    return {
      header: HELP_FROM,
      name: match?.[1] || "Johnston Media",
      email: match?.[2] || HELP_FROM,
    };
  }

  try {
    const snap = await adminDb().collection("mailboxes").doc(mailbox).get();
    const name = snap.exists ? (snap.data()?.fromName as string | undefined) : undefined;
    return {
      header: name ? `${name} <${mailbox}>` : mailbox,
      name: name || "Johnston Media",
      email: mailbox,
    };
  } catch {
    return { header: mailbox, name: "Johnston Media", email: mailbox };
  }
}

/** Shared escaping, so nothing typed into a reply box ships as markup. */
function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Plain text into paragraphs, the way a typed message reads. */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="margin:0 0 16px 0">${escape(block).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

/** Cleaned, de-duplicated, and never a repeat of who it is already going to. */
function addresses(value: unknown, exclude: string[]): string[] {
  const raw = Array.isArray(value) ? value : [value];
  const list: string[] = [];
  for (const entry of raw) {
    const address = clean(entry, 200).toLowerCase();
    if (!address || !EMAIL_RE.test(address)) continue;
    if (exclude.includes(address) || list.includes(address)) continue;
    list.push(address);
  }
  return list.slice(0, 10);
}

/**
 * Replies to a help thread, and optionally closes it.
 *
 * Level "draft" is enough: answering someone who wrote in is support, not
 * marketing, and it goes to exactly one person who asked for it.
 */
export async function POST(request: Request) {
  const caller = await requireEmailLevel(request, "draft");
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "You don't have permission to reply." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const threadId = clean(body.threadId, 120);
  const message = cleanMultiline(body.message, 8000);
  const close = body.close === true;

  if (!threadId || !message) {
    return NextResponse.json(
      { ok: false, error: "A reply needs a thread and some words." },
      { status: 400 },
    );
  }

  const db = adminDb();
  const ref = db.collection("helpThreads").doc(threadId);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json(
      { ok: false, error: "Thread not found." },
      { status: 404 },
    );
  }

  const thread = { id: snap.id, ...snap.data() } as HelpThread;
  const now = new Date().toISOString();

  const sender = await senderFor(thread.mailbox);
  const cc = addresses(body.cc, [thread.fromEmail.toLowerCase()]);
  const bcc = addresses(body.bcc, [thread.fromEmail.toLowerCase(), ...cc]);
  const subject = `Re: ${thread.subject}`;

  // The same shell a composed email gets. A reply used to go out as a bare
  // paragraph in a system font with no logo, no signature and no sender
  // identification — so an answer from the platform looked nothing like an
  // email from the same business sent ten minutes earlier.
  const html = plainShell(paragraphs(message), subject, {
    fromName: sender.name,
    fromEmail: sender.email,
    senderAddress: SENDER_ADDRESS,
  });

  let emailed = false;
  let sendError: string | undefined;

  if (KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: sender.header,
          to: [thread.fromEmail],
          ...(cc.length ? { cc } : {}),
          ...(bcc.length ? { bcc } : {}),
          subject,
          reply_to: sender.header,
          text: message,
          html,
        }),
      });
      emailed = response.ok;
      if (!response.ok) sendError = (await response.text()).slice(0, 200);
    } catch (err) {
      sendError = err instanceof Error ? err.message : "network error";
    }
  } else {
    sendError = "RESEND_API_KEY is not set.";
  }

  // Record the reply either way. A reply that failed to send still needs to be
  // visible, or the next person answers the same question twice.
  await ref.collection("messages").add({
    direction: "out",
    fromEmail: sender.email,
    toEmail: thread.fromEmail,
    body: message,
    // What the other person is looking at, rather than a transcript of the
    // box it was typed into.
    html,
    ...(cc.length ? { cc } : {}),
    ...(bcc.length ? { bcc } : {}),
    authorEmail: caller.email,
    createdAt: now,
    ...(emailed ? {} : { failed: true }),
  });

  await ref.update({
    status: close ? "Closed" : "Waiting",
    unread: false,
    messageCount: (thread.messageCount ?? 0) + 1,
    // Replying puts the thread in Sent too; it stays in the Inbox because
    // hasInbound is what put it there and nothing here clears it.
    hasOutbound: true,
    lastAuthorName: caller.access.name || caller.email,
    lastAuthorEmail: caller.email,
    lastMessageAt: now,
  });

  return NextResponse.json({ ok: true, emailed, error: sendError });
}
