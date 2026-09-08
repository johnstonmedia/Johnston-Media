import { NextResponse } from "next/server";

import { sendContactAlertToOwner } from "@/lib/email";
import { adminDb } from "@/lib/firebaseAdmin";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { validateContact } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Contact form → Firestore `messages` + an email alert to Will. */
export async function POST(request: Request) {
  const limit = rateLimit(`contact:${clientIp(request)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many messages. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
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

  const { errors, value } = validateContact(body);

  if (value.company) {
    return NextResponse.json({ ok: true });
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  try {
    await adminDb().collection("messages").add({
      name: value.name,
      email: value.email,
      message: value.message,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[contact] failed to save:", err);
    return NextResponse.json(
      { ok: false, error: "Could not send your message. Please try again." },
      { status: 500 },
    );
  }

  await sendContactAlertToOwner(value);

  return NextResponse.json({ ok: true });
}
