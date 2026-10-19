import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getEmailCaller } from "@/lib/emailAccess";
import { isPushConfigured } from "@/lib/push";
import { adminDb } from "@/lib/firebaseAdmin";
import { clean } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The endpoint is a URL far too long for a document id, so it's hashed. */
function deviceId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 40);
}

/**
 * The devices this person has subscribed, so they can be seen and cleared.
 *
 * A push service answering "accepted" is not the same as a device showing
 * anything: a subscription left behind by a browser profile that no longer
 * exists is still a row here, still counted as sent, and silent forever.
 * Until this existed there was no way to notice that, let alone remove it.
 *
 * Endpoints are capability URLs — anyone holding one can push to that device
 * — so the id goes out instead, hashed the same way the client can hash its
 * own, which is enough to mark which row is the device you are looking at.
 */
export async function GET(request: Request) {
  const caller = await getEmailCaller(request);
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Sign in to see your devices." },
      { status: 403 },
    );
  }

  const snap = await adminDb()
    .collection("pushSubscriptions")
    .where("uid", "==", caller.uid)
    .get();

  const devices = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      label: (data.label as string) || "Unknown device",
      mailboxes: (data.mailboxes as string[]) ?? [],
      createdAt: (data.createdAt as string) ?? "",
    };
  });

  return NextResponse.json({ ok: true, devices });
}

/** Removes one device by id, whichever device is asking. */
export async function DELETE(request: Request) {
  const caller = await getEmailCaller(request);
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Sign in to remove a device." },
      { status: 403 },
    );
  }

  const id = clean(new URL(request.url).searchParams.get("id"), 64);
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Which device?" },
      { status: 400 },
    );
  }

  const ref = adminDb().collection("pushSubscriptions").doc(id);
  const snap = await ref.get();

  // Yours to remove, nobody else's.
  if (!snap.exists || snap.data()?.uid !== caller.uid) {
    return NextResponse.json(
      { ok: false, error: "That isn't one of your devices." },
      { status: 404 },
    );
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}

/**
 * Registers, updates or removes this device's push subscription.
 *
 * A subscription is per-device rather than per-person: your phone can buzz
 * for help@ while your laptop stays quiet. Choosing no mailboxes is the same
 * as turning it off, so the row is deleted rather than kept as a subscription
 * that never fires.
 *
 * A device may only ask to be woken for mailboxes the person is allowed to
 * read. Otherwise the notification preview becomes a way to read the subject
 * lines of mail you were never granted.
 */
export async function POST(request: Request) {
  if (!isPushConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Push isn't configured on the server — VAPID keys are missing.",
      },
      { status: 503 },
    );
  }

  const caller = await getEmailCaller(request);
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Sign in to manage notifications." },
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

  const subscription = body.subscription as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    | undefined;
  const endpoint = clean(subscription?.endpoint, 800);

  if (!endpoint || !/^https:\/\//.test(endpoint)) {
    return NextResponse.json(
      { ok: false, error: "That isn't a usable push subscription." },
      { status: 400 },
    );
  }

  const db = adminDb();
  const id = deviceId(endpoint);

  // Only mailboxes this person may actually read.
  const allowed = caller.access.visibleMailboxes ?? [];
  const unrestricted = caller.access.level === "admin" || allowed.length === 0;

  const wanted = Array.isArray(body.mailboxes) ? body.mailboxes : [];
  const mailboxes: string[] = [];
  for (const entry of wanted.slice(0, 30)) {
    const address = clean(entry, 200).toLowerCase();
    if (!address) continue;
    if (!unrestricted && !allowed.includes(address)) {
      return NextResponse.json(
        {
          ok: false,
          error: `You don't have access to ${address}.`,
        },
        { status: 403 },
      );
    }
    if (!mailboxes.includes(address)) mailboxes.push(address);
  }

  if (mailboxes.length === 0) {
    await db.collection("pushSubscriptions").doc(id).delete().catch(() => {});
    return NextResponse.json({ ok: true, subscribed: false, mailboxes: [] });
  }

  const p256dh = clean(subscription?.keys?.p256dh, 200);
  const auth = clean(subscription?.keys?.auth, 200);
  if (!p256dh || !auth) {
    return NextResponse.json(
      { ok: false, error: "That subscription is missing its keys." },
      { status: 400 },
    );
  }

  await db
    .collection("pushSubscriptions")
    .doc(id)
    .set(
      {
        uid: caller.uid,
        email: caller.email,
        endpoint,
        keys: { p256dh, auth },
        mailboxes,
        label: clean(body.label, 120) || "",
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );

  return NextResponse.json({ ok: true, subscribed: true, mailboxes });
}
