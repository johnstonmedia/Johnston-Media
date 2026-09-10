import { NextResponse } from "next/server";

import { merge } from "@/lib/broadcast";
import { canSendAs, requireEmailLevel } from "@/lib/emailAccess";
import type { EmailTemplate, HelpThread } from "@/lib/emailTypes";
import { adminDb } from "@/lib/firebaseAdmin";
import { SITE_URL } from "@/lib/siteUrl";
import { clean, cleanMultiline } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.RESEND_API_KEY;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** One-off mail is one-to-a-few. Past this it's a campaign, with its own rules. */
const MAX_RECIPIENTS = 10;

const SENDER_ADDRESS =
  process.env.EMAIL_SENDER_ADDRESS ?? "New South Wales, Australia";

/** Plain text into simple paragraphs, so a typed message arrives readable. */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="margin:0 0 16px 0">${block
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

/**
 * Sends a one-off email, and files it in the inbox as a conversation.
 *
 * Distinct from a campaign in one important way: this is ordinary
 * correspondence to someone you're addressing directly, so it carries no
 * unsubscribe link and isn't gated on the marketing rules. Which is also why
 * it's capped at a handful of recipients — the moment you're mailing a list,
 * you're doing marketing, and that belongs in Campaigns where the Spam Act
 * checks actually run.
 *
 * Requires "send" rather than "draft": replying to someone who wrote to you is
 * a smaller thing than starting a conversation with an arbitrary address.
 */
export async function POST(request: Request) {
  const caller = await requireEmailLevel(request, "send");
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "You don't have permission to send email." },
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

  const from = clean(body.from, 200).toLowerCase();
  const subject = clean(body.subject, 300);
  const message = cleanMultiline(body.message, 20000);
  const templateId = clean(body.templateId, 120);

  if (!from || !EMAIL_RE.test(from)) {
    return NextResponse.json(
      { ok: false, error: "Pick which address to send from." },
      { status: 400 },
    );
  }
  if (!canSendAs(caller, from)) {
    return NextResponse.json(
      { ok: false, error: `You're not allowed to send as ${from}.` },
      { status: 403 },
    );
  }
  if (!subject) {
    return NextResponse.json(
      { ok: false, error: "The email needs a subject." },
      { status: 400 },
    );
  }
  if (!message) {
    return NextResponse.json(
      { ok: false, error: "The email is empty." },
      { status: 400 },
    );
  }

  // Recipients.
  const rawTo = Array.isArray(body.to) ? body.to : [body.to];
  const to: string[] = [];
  for (const entry of rawTo) {
    const address = clean(entry, 200).toLowerCase();
    if (!address) continue;
    if (!EMAIL_RE.test(address)) {
      return NextResponse.json(
        { ok: false, error: `"${address}" isn't a valid email address.` },
        { status: 400 },
      );
    }
    if (!to.includes(address)) to.push(address);
  }

  if (to.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Add at least one recipient." },
      { status: 400 },
    );
  }
  if (to.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      {
        ok: false,
        error: `That's ${to.length} recipients. Anything past ${MAX_RECIPIENTS} should be a campaign, so the unsubscribe rules apply.`,
      },
      { status: 400 },
    );
  }

  const db = adminDb();

  // The mailbox this is sent from — used for the reply-to and the thread.
  let fromName = "Johnston Media";
  try {
    const box = await db.collection("mailboxes").doc(from).get();
    if (box.exists && box.data()?.fromName) {
      fromName = box.data()!.fromName as string;
    }
  } catch {
    // A missing mailbox record is not a reason to refuse to send.
  }

  // Optional template wrap.
  let template: EmailTemplate | null = null;
  if (templateId) {
    const snap = await db.collection("emailTemplates").doc(templateId).get();
    if (snap.exists) template = { id: snap.id, ...snap.data() } as EmailTemplate;
  }

  const bodyHtml = paragraphs(message);
  const now = new Date().toISOString();
  const results: { to: string; ok: boolean; error?: string }[] = [];

  for (const recipient of to) {
    const values: Record<string, string> = {
      name: recipient.split("@")[0],
      first_name: recipient.split("@")[0],
      email: recipient,
      subject,
      preheader: "",
      sender_name: fromName,
      sender_address: SENDER_ADDRESS,
      postal_address: SENDER_ADDRESS,
      contact_email: from,
      logo_url: `${SITE_URL}/logo.png`,
      year: String(new Date().getFullYear()),
      eyebrow: clean(body.eyebrow, 120),
      headline: clean(body.headline, 200) || subject,
      lead_paragraph: clean(body.lead, 400),
      primary_url: clean(body.primaryUrl, 600),
      primary_label: clean(body.primaryLabel, 120),
      footer_note: clean(body.footerNote, 400),
      // Direct correspondence, not marketing — there is nothing to
      // unsubscribe from, so the token resolves to the site rather than
      // leaving a dead link in the template's footer.
      unsubscribe_url: SITE_URL,
    };

    const html = template
      ? merge(template.html, {
          ...values,
          content: bodyHtml,
          message_body: bodyHtml,
        })
      : bodyHtml;

    if (!KEY) {
      results.push({ to: recipient, ok: false, error: "RESEND_API_KEY is not set." });
      continue;
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${from}>`,
          to: [recipient],
          subject,
          reply_to: from,
          html,
          text: message,
        }),
      });

      if (!response.ok) {
        results.push({
          to: recipient,
          ok: false,
          error: (await response.text()).slice(0, 200),
        });
        continue;
      }
      results.push({ to: recipient, ok: true });
    } catch (err) {
      results.push({
        to: recipient,
        ok: false,
        error: err instanceof Error ? err.message : "network error",
      });
    }

    // File it in the inbox so the conversation exists before they reply.
    // The thread is keyed on the other party, which is what the inbound
    // webhook matches on — so their reply lands on this thread rather than
    // starting a second one.
    try {
      const existing = await db
        .collection("helpThreads")
        .where("fromEmail", "==", recipient)
        .where("subject", "==", subject)
        .where("mailbox", "==", from)
        .limit(1)
        .get();

      let threadId: string;
      if (existing.empty) {
        const thread: Omit<HelpThread, "id"> = {
          subject,
          fromEmail: recipient,
          mailbox: from,
          status: "Waiting",
          snippet: message.replace(/\s+/g, " ").slice(0, 180),
          messageCount: 1,
          unread: false,
          createdAt: now,
          lastMessageAt: now,
        };
        threadId = (await db.collection("helpThreads").add(thread)).id;
      } else {
        threadId = existing.docs[0].id;
        const current = existing.docs[0].data() as HelpThread;
        await existing.docs[0].ref.update({
          status: "Waiting",
          snippet: message.replace(/\s+/g, " ").slice(0, 180),
          messageCount: (current.messageCount ?? 0) + 1,
          lastMessageAt: now,
        });
      }

      await db
        .collection("helpThreads")
        .doc(threadId)
        .collection("messages")
        .add({
          direction: "out",
          fromEmail: from,
          body: message,
          authorEmail: caller.email,
          createdAt: now,
        });
    } catch (err) {
      console.error("[compose] could not file the thread:", err);
    }
  }

  const sent = results.filter((r) => r.ok).length;

  return NextResponse.json({
    ok: sent > 0,
    sent,
    failed: results.length - sent,
    errors: results.filter((r) => !r.ok).map((r) => `${r.to}: ${r.error}`),
  });
}
