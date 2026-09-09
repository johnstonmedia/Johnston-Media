import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import type { HelpThread } from "@/lib/emailTypes";
import { adminDb } from "@/lib/firebaseAdmin";

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

function authorised(request: Request, raw: string): boolean {
  if (!SECRET) return false;

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key && key === SECRET) return true;

  const signature =
    request.headers.get("x-inbound-signature") ??
    request.headers.get("svix-signature") ??
    "";
  if (!signature) return false;

  const expected = createHmac("sha256", SECRET).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.replace(/^sha256=/, ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pulls a field out of whichever shape the provider used. */
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

  const fromRaw = pick(payload, "from", "sender", "envelope.from", "data.from");
  const subject =
    pick(payload, "subject", "data.subject") || "(no subject)";
  const body =
    pick(payload, "text", "plain", "data.text", "body-plain", "html", "data.html") ||
    "(empty message)";

  if (!fromRaw) {
    return NextResponse.json(
      { ok: false, error: "No sender address in the payload." },
      { status: 400 },
    );
  }

  const from = parseAddress(fromRaw);
  const now = new Date().toISOString();
  const db = adminDb();

  // Group replies with the original by subject and sender, so a back-and-forth
  // reads as one conversation rather than four unrelated tickets.
  const normalised = subject.replace(/^\s*(re|fwd|fw)\s*:\s*/i, "").trim();

  const existing = await db
    .collection("helpThreads")
    .where("fromEmail", "==", from.email.toLowerCase())
    .where("subject", "==", normalised)
    .limit(1)
    .get();

  let threadId: string;

  if (existing.empty) {
    const thread: Omit<HelpThread, "id"> = {
      subject: normalised,
      fromEmail: from.email.toLowerCase(),
      fromName: from.name,
      status: "Open",
      snippet: snippetOf(body),
      messageCount: 1,
      unread: true,
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
      body,
      createdAt: now,
    });

  return NextResponse.json({ ok: true, threadId });
}
