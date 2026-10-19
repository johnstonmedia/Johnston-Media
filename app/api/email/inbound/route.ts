import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import type { HelpThread } from "@/lib/emailTypes";
import { adminDb } from "@/lib/firebaseAdmin";
import { notifyMailbox } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound mail for help@ — the help desk's front door.
 *
 * Provider-agnostic on purpose: it accepts the common shape that Resend
 * Inbound, Cloudflare Email Workers and SendGrid's Inbound Parse all produce,
 * so the help desk isn't welded to whichever one is wired up today.
 *
 * Set EMAIL_INBOUND_SECRET and have the provider sign the body, or pass it as
 * ?key=. Without a secret configured the endpoint refuses everything rather
 * than accepting anonymous writes: an open inbound endpoint is a spam funnel
 * straight into the team's inbox.
 */
const SECRET = process.env.EMAIL_INBOUND_SECRET;
/** The whsec_… Resend shows after creating a webhook. */
const SIGNING_SECRET = process.env.EMAIL_INBOUND_SIGNING_SECRET;

/** Either form of proof is configured. */
function configured(): boolean {
  return Boolean(SECRET || SIGNING_SECRET);
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Verifies a Svix-signed webhook, which is how Resend signs inbound mail.
 *
 * Svix signs `id.timestamp.body` with the webhook's secret — the base64 part
 * of whsec_… — and sends the result base64 in a space-separated list of
 * `v1,<signature>` entries, because a secret being rotated means two valid
 * signatures for a while. Any one matching is enough.
 *
 * The timestamp is checked as well as the signature: without it a captured
 * delivery could be replayed back at this endpoint forever.
 */
function verifySvix(raw: string, headers: Headers): boolean {
  if (!SIGNING_SECRET) return false;

  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const header = headers.get("svix-signature");
  if (!id || !timestamp || !header) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(SIGNING_SECRET.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64");

  return header
    .split(" ")
    .some((entry) => {
      const [version, signature] = entry.split(",");
      return version === "v1" && signature ? sameString(expected, signature) : false;
    });
}

/**
 * Two ways in, because providers differ on what they will accept.
 *
 * Svix signatures are the right one and need nothing in the URL — which
 * matters, since Resend refuses a webhook endpoint carrying a query string.
 * The ?key= form stays for forwarders that can't sign but can be pointed at
 * an arbitrary URL.
 */
function authorised(request: Request, raw: string): boolean {
  if (verifySvix(raw, request.headers)) return true;

  if (SECRET) {
    const key = new URL(request.url).searchParams.get("key");
    if (key && sameString(SECRET, key)) return true;
  }

  return false;
}

/**
 * Pulls a field out of whichever shape the provider used.
 *
 * Accepts an array as well as a string, and takes the first entry: Resend's
 * inbound webhook sends `to` as a list. Read as a string only, it came back
 * empty and every message fell through to the default mailbox — so mail to
 * quote@ and invoice@ would all have been filed under help@, which is the
 * one thing the inbox is built not to do.
 */
function pick(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = key.split(".").reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[part]
          : undefined,
      payload,
    );
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find(
        (entry) => typeof entry === "string" && entry.trim(),
      );
      if (typeof first === "string") return first.trim();
    }
  }
  return "";
}

/** "Jane Doe <jane@example.com>" → { name, email } */
function parseAddress(raw: string): { name?: string; email: string } {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].replace(/^"|"$/g, "") || undefined, email: match[2] };
  }
  return { email: raw.trim() };
}

/** Strips the quoted history so the list preview shows the new part. */
function snippetOf(body: string): string {
  const firstReply = body.split(/\n\s*(?:On .* wrote:|-----Original Message-----|>)/)[0];
  return firstReply.replace(/\s+/g, " ").trim().slice(0, 180);
}

export async function POST(request: Request) {
  const raw = await request.text();

  // A blank EMAIL_INBOUND_SECRET and a wrong key both ended up as a flat
  // "Not authorised", which is the same answer to two very different
  // questions — and the first one is a server misconfiguration nobody can
  // diagnose from the provider's end.
  if (!configured()) {
    console.error(
      "[inbound] neither EMAIL_INBOUND_SIGNING_SECRET nor EMAIL_INBOUND_SECRET " +
        "is set — refusing all inbound mail.",
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          "This server has no inbound secret set, so it refuses all inbound " +
          "mail. Set EMAIL_INBOUND_SIGNING_SECRET to the whsec_… value the " +
          "provider shows for this webhook, and redeploy.",
      },
      { status: 503 },
    );
  }

  if (!authorised(request, raw)) {
    return NextResponse.json(
      { ok: false, error: "Not authorised." },
      { status: 401 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid payload." },
      { status: 400 },
    );
  }

  const fromRaw = pick(payload, "data.from", "from", "sender", "envelope.from");
  // Which of our addresses this landed on — the inbox groups on it, so a
  // message with no usable To falls back to the configured default rather
  // than disappearing into an unnamed pile.
  const toRaw =
    pick(payload, "data.to", "to", "recipient", "envelope.to") ||
    process.env.EMAIL_HELP_ADDRESS ||
    "help@wjohnstonmedia.com";
  const subject =
    pick(payload, "data.subject", "subject") || "(no subject)";
  const body =
    pick(payload, "data.text", "text", "plain", "body-plain", "data.html", "html") ||
    "(empty message)";

  if (!fromRaw) {
    return NextResponse.json(
      { ok: false, error: "No sender address in the payload." },
      { status: 400 },
    );
  }

  const from = parseAddress(fromRaw);
  // A To header can carry several addresses; the first ours is the mailbox.
  const mailbox = parseAddress(toRaw.split(",")[0] ?? toRaw).email.toLowerCase();
  const now = new Date().toISOString();
  const db = adminDb();

  // Group replies with the original by subject and sender, so a back-and-forth
  // reads as one conversation rather than four unrelated tickets.
  const normalised = subject.replace(/^\s*(re|fwd|fw)\s*:\s*/i, "").trim();

  const existing = await db
    .collection("helpThreads")
    .where("fromEmail", "==", from.email.toLowerCase())
    .where("subject", "==", normalised)
    .where("mailbox", "==", mailbox)
    .limit(1)
    .get();

  let threadId: string;

  if (existing.empty) {
    const thread: Omit<HelpThread, "id"> = {
      subject: normalised,
      fromEmail: from.email.toLowerCase(),
      // Omitted rather than set to undefined: Firestore rejects an undefined
      // value outright, and "bob@example.com" with no display name is the
      // common case — so every such email crashed the webhook and never
      // reached the inbox at all.
      ...(from.name ? { fromName: from.name } : {}),
      mailbox,
      status: "Open",
      snippet: snippetOf(body),
      messageCount: 1,
      unread: true,
      hasInbound: true,
      createdAt: now,
      lastMessageAt: now,
    };
    const ref = await db.collection("helpThreads").add(thread);
    threadId = ref.id;
  } else {
    threadId = existing.docs[0].id;
    const current = existing.docs[0].data() as HelpThread;
    await existing.docs[0].ref.update({
      // A closed thread that gets a reply is open again — the person isn't done.
      status: current.status === "Closed" ? "Open" : current.status,
      snippet: snippetOf(body),
      messageCount: (current.messageCount ?? 0) + 1,
      unread: true,
      // A reply to something you sent moves that thread into the Inbox as
      // well, without taking it out of Sent — it is now a conversation.
      hasInbound: true,
      lastMessageAt: now,
    });
  }

  await db
    .collection("helpThreads")
    .doc(threadId)
    .collection("messages")
    .add({
      direction: "in",
      fromEmail: from.email.toLowerCase(),
      fromName: from.name ?? null,
      toEmail: mailbox,
      body,
      createdAt: now,
    });

  // Wake any device subscribed to this mailbox. The mail is already filed, so
  // this is a courtesy on top of it — notifyMailbox never throws, because a
  // push service having a bad afternoon must not turn a received email into a
  // failed webhook the provider then retries.
  await notifyMailbox(mailbox, {
    title: from.name || from.email,
    body: normalised,
    url: `/email?section=inbox&mailbox=${encodeURIComponent(mailbox)}&thread=${threadId}`,
    tag: threadId,
  });

  return NextResponse.json({ ok: true, threadId, mailbox });
}
