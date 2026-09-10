import { NextResponse } from "next/server";

import { requireEmailLevel } from "@/lib/emailAccess";
import type { HelpThread } from "@/lib/emailTypes";
import { adminDb } from "@/lib/firebaseAdmin";
import { clean, cleanMultiline } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.RESEND_API_KEY;
const HELP_FROM =
  process.env.EMAIL_HELP_FROM ?? "Johnston Media Help <help@wjohnstonmedia.com>";

/**
 * Replies go out from the address the message arrived at.
 *
 * Someone who wrote to hello@ should get an answer from hello@, not from a
 * support address they've never seen — the reply belongs to the conversation
 * they started, and a different sender breaks the thread in their client.
 */
async function senderFor(mailbox: string | undefined): Promise<string> {
  if (!mailbox) return HELP_FROM;

  try {
    const snap = await adminDb().collection("mailboxes").doc(mailbox).get();
    const name = snap.exists ? (snap.data()?.fromName as string | undefined) : undefined;
    return name ? `${name} <${mailbox}>` : mailbox;
  } catch {
    return mailbox;
  }
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

  const from = await senderFor(thread.mailbox);

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
          from,
          to: [thread.fromEmail],
          subject: `Re: ${thread.subject}`,
          reply_to: from,
          text: message,
          html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.7;color:#12181d">${message
            .split(/\n{2,}/)
            .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
            .join("")}</div>`,
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
    fromEmail: from,
    body: message,
    authorEmail: caller.email,
    createdAt: now,
    ...(emailed ? {} : { failed: true }),
  });

  await ref.update({
    status: close ? "Closed" : "Waiting",
    unread: false,
    messageCount: (thread.messageCount ?? 0) + 1,
    lastMessageAt: now,
  });

  return NextResponse.json({ ok: true, emailed, error: sendError });
}
