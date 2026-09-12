import { NextResponse } from "next/server";

import { confirmUrl, verifyConfirm } from "@/lib/broadcast";
import type { Contact } from "@/lib/emailTypes";
import { adminDb } from "@/lib/firebaseAdmin";
import { SITE_URL } from "@/lib/siteUrl";
import { clean } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEY = process.env.RESEND_API_KEY;
const FROM =
  process.env.EMAIL_FROM_NOREPLY ??
  "Johnston Media <no-reply@wjohnstonmedia.com>";
const SENDER_ADDRESS =
  process.env.EMAIL_SENDER_ADDRESS ?? "New South Wales, Australia";

/**
 * Joining the mailing list, and confirming it.
 *
 * Double opt-in, deliberately. Under the Spam Act the burden of proof sits
 * with the sender: you have to be able to show that a person consented, and
 * a row in a database saying so is not evidence — anyone can type anyone
 * else's address into a form. A confirmation click proves the address belongs
 * to whoever asked, and it is the difference between a list you can defend
 * and one you merely have.
 *
 * POST records the request and sends the confirmation.
 * GET  is the link in that email.
 *
 * Nothing here is authenticated: it is a public form. That means it must be
 * safe to call repeatedly with someone else's address, which is why a POST
 * never reveals whether an address is already on the list and never marks
 * anybody as subscribed on its own.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  // A hidden field real people never fill in. Bots fill in everything.
  if (clean(body.company, 200)) {
    return NextResponse.json({ ok: true, pending: true });
  }

  const email = clean(body.email, 200).toLowerCase();
  const name = clean(body.name, 120);
  const source = clean(body.source, 80) || "website";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "That doesn't look like an email address." },
      { status: 400 },
    );
  }

  const db = adminDb();
  const existing = await db
    .collection("contacts")
    .where("email", "==", email)
    .limit(1)
    .get();

  const now = new Date().toISOString();
  // Vercel puts the client address here; it is part of the consent record.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  let contactId: string;

  if (existing.empty) {
    const contact: Omit<Contact, "id"> = {
      email,
      name: name || undefined,
      tags: [],
      // Not subscribed until they click. This is the whole point.
      subscribed: false,
      source,
      consentAt: now,
      consentSource: source,
      consentIp: ip,
      createdAt: now,
    };
    contactId = (await db.collection("contacts").add(contact)).id;
  } else {
    contactId = existing.docs[0].id;
    const current = existing.docs[0].data() as Contact;

    // Someone who unsubscribed and is signing up again is allowed to — but
    // it starts from scratch, with a fresh confirmation. An unsubscribe is
    // not undone by a form post that anybody could have made.
    await existing.docs[0].ref.update({
      name: name || current.name || null,
      consentAt: now,
      consentSource: source,
      consentIp: ip,
    });
  }

  await sendConfirmation(email, name, contactId);

  // Deliberately the same answer whether or not they were already on the
  // list: a different one turns this form into a way to test who is.
  return NextResponse.json({ ok: true, pending: true });
}

/** The confirmation link from that email. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const contactId = url.searchParams.get("c") ?? "";
  const email = (url.searchParams.get("e") ?? "").toLowerCase();
  const sig = url.searchParams.get("s") ?? "";

  if (!contactId || !email || !sig || !verifyConfirm(contactId, email, sig)) {
    return page(
      "That link isn't valid",
      "It may have been altered on the way. Try subscribing again from the site.",
    );
  }

  const db = adminDb();
  const ref = db.collection("contacts").doc(contactId);
  const snap = await ref.get();

  if (!snap.exists || (snap.data() as Contact).email !== email) {
    return page(
      "We couldn't find that",
      "The record may have been removed. Try subscribing again from the site.",
    );
  }

  await ref.update({
    subscribed: true,
    confirmedAt: new Date().toISOString(),
    unsubscribedAt: null,
  });

  return page(
    "You're on the list",
    "Thanks — you'll hear from Johnston Media now and then, and never often. Every email has an unsubscribe link.",
  );
}

/** A plain, self-contained confirmation page. */
function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html lang="en-AU"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · Johnston Media</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#0b0b0b; color:#e8e8e8; padding:24px;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  .card { max-width:26rem; text-align:center; }
  h1 { font-family:Georgia,serif; font-weight:400; font-size:1.6rem; margin:0 0 .75rem; }
  p { line-height:1.7; color:#a9b4bd; margin:0 0 1.5rem; }
  a { display:inline-block; padding:.7rem 1.5rem; border-radius:999px;
      background:#c15a32; color:#fff; text-decoration:none; font-size:.85rem;
      letter-spacing:.08em; text-transform:uppercase; }
</style></head>
<body><div class="card">
  <h1>${title}</h1><p>${body}</p>
  <a href="${SITE_URL}">Back to the site</a>
</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * The confirmation email.
 *
 * Sent from no-reply@ because there is nothing to reply to, and kept plain:
 * this is the one message in the system that has to arrive, so it carries no
 * images, no tracking and nothing a spam filter has to think about.
 */
async function sendConfirmation(email: string, name: string, id: string) {
  if (!KEY) {
    console.warn("[subscribe] RESEND_API_KEY missing — no confirmation sent.");
    return;
  }

  const link = confirmUrl(id, email);
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: "Confirm your subscription",
        html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#1d2730">
<p>${greeting}</p>
<p>Someone — hopefully you — asked to hear from Johnston Media. Click below to confirm and we'll add you to the list.</p>
<p style="margin:28px 0"><a href="${link}" style="background:#c15a32;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase">Confirm subscription</a></p>
<p style="font-size:13px;color:#66737d">If that wasn't you, ignore this email — nothing happens unless you click, and you won't hear from us again.</p>
<p style="font-size:11px;color:#8a9aa6">${escapeHtml(SENDER_ADDRESS)}</p>
</div>`,
        text: `${name ? `Hi ${name},` : "Hi,"}\n\nSomeone — hopefully you — asked to hear from Johnston Media. Confirm here:\n\n${link}\n\nIf that wasn't you, ignore this email. Nothing happens unless you click.\n\n${SENDER_ADDRESS}`,
      }),
    });
  } catch (err) {
    console.error("[subscribe] confirmation send failed:", err);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
