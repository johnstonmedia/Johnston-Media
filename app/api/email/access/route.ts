import { NextResponse } from "next/server";

import { requireEmailLevel } from "@/lib/emailAccess";
import {
  EMAIL_LEVELS,
  type EmailAccess,
  type EmailLevel,
} from "@/lib/emailTypes";
import { adminDb } from "@/lib/firebaseAdmin";
import { clean } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only a valid, deliverable-looking address may end up on an allow-list. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Grants or changes someone's access to the email platform.
 *
 * Admin only, and it will not let you demote yourself — locking the last
 * administrator out of the tool that sends the mail is a bad afternoon.
 */
export async function POST(request: Request) {
  const caller = await requireEmailLevel(request, "admin");
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Only an email admin can change access." },
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

  const uid = clean(body.uid, 128);
  const level = clean(body.level, 20) as EmailLevel;

  if (!uid) {
    return NextResponse.json({ ok: false, error: "Missing uid." }, { status: 400 });
  }
  if (!EMAIL_LEVELS.includes(level)) {
    return NextResponse.json(
      { ok: false, error: `Unknown access level "${level}".` },
      { status: 400 },
    );
  }
  if (uid === caller.uid && level !== "admin") {
    return NextResponse.json(
      { ok: false, error: "You can't remove your own admin access." },
      { status: 400 },
    );
  }

  // The allow-list is the security boundary, so it's validated, not trusted.
  const rawFrom = Array.isArray(body.allowedFrom) ? body.allowedFrom : [];
  const allowedFrom: string[] = [];
  for (const entry of rawFrom.slice(0, 20)) {
    const address = clean(entry, 200).toLowerCase();
    if (!address) continue;
    if (!EMAIL_RE.test(address)) {
      return NextResponse.json(
        { ok: false, error: `"${address}" isn't a valid email address.` },
        { status: 400 },
      );
    }
    allowedFrom.push(address);
  }

  // Their own address. Kept inside allowedFrom so the primary can never be
  // one they aren't permitted to use.
  const primaryFrom = clean(body.primaryFrom, 200).toLowerCase();
  if (primaryFrom) {
    if (!EMAIL_RE.test(primaryFrom)) {
      return NextResponse.json(
        { ok: false, error: `"${primaryFrom}" isn't a valid email address.` },
        { status: 400 },
      );
    }
    if (!allowedFrom.includes(primaryFrom)) allowedFrom.push(primaryFrom);
  }

  // Which mailboxes they may read. Empty means all — that is what everyone
  // had before this field existed, and narrowing by default would silently
  // cut people off from mail they were already handling.
  const rawVisible = Array.isArray(body.visibleMailboxes)
    ? body.visibleMailboxes
    : [];
  const visibleMailboxes: string[] = [];
  for (const entry of rawVisible.slice(0, 30)) {
    const address = clean(entry, 200).toLowerCase();
    if (!address) continue;
    if (!EMAIL_RE.test(address)) {
      return NextResponse.json(
        { ok: false, error: `"${address}" isn't a valid mailbox.` },
        { status: 400 },
      );
    }
    visibleMailboxes.push(address);
  }

  const maxRaw = body.maxRecipients;
  let maxRecipients: number | undefined;
  if (maxRaw !== undefined && maxRaw !== null && maxRaw !== "") {
    maxRecipients = Math.round(Number(maxRaw));
    if (!Number.isFinite(maxRecipients) || maxRecipients < 1) {
      return NextResponse.json(
        { ok: false, error: "The recipient limit must be a positive number." },
        { status: 400 },
      );
    }
  }

  const db = adminDb();
  const user = await db.collection("users").doc(uid).get();

  if (!user.exists) {
    return NextResponse.json(
      { ok: false, error: "That person doesn't have an account yet." },
      { status: 404 },
    );
  }

  const profile = user.data() ?? {};

  /**
   * Give them an address of their own.
   *
   * A person joining the team needs somewhere their mail lands, and asking an
   * admin to go and create it by hand in another panel is how people end up
   * sharing hello@. Created as personal, owned by them, and added to both the
   * addresses they may send as and the mailboxes they may read.
   */
  const personalAddress = clean(body.createPersonal, 200).toLowerCase();
  if (personalAddress) {
    if (!EMAIL_RE.test(personalAddress)) {
      return NextResponse.json(
        { ok: false, error: `"${personalAddress}" isn't a valid address.` },
        { status: 400 },
      );
    }

    const existing = await db
      .collection("mailboxes")
      .doc(personalAddress)
      .get();

    // Never silently take over an address that already belongs to someone.
    if (existing.exists && existing.data()?.ownerUid &&
        existing.data()?.ownerUid !== uid) {
      return NextResponse.json(
        { ok: false, error: `${personalAddress} already belongs to someone else.` },
        { status: 409 },
      );
    }

    const label =
      clean(body.personalLabel, 60) ||
      (profile.name as string | undefined)?.split(/\s+/)[0] ||
      personalAddress.split("@")[0];

    await db.collection("mailboxes").doc(personalAddress).set(
      {
        label,
        description: `${profile.name ?? personalAddress}'s own address`,
        fromName: (profile.name as string | undefined) || label,
        personal: true,
        ownerUid: uid,
        order: 50,
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );

    if (!allowedFrom.includes(personalAddress)) allowedFrom.push(personalAddress);
    if (visibleMailboxes.length && !visibleMailboxes.includes(personalAddress)) {
      visibleMailboxes.push(personalAddress);
    }
  }

  const record: Omit<EmailAccess, "uid"> = {
    email: profile.email ?? "",
    name: profile.name ?? undefined,
    level,
    allowedFrom,
    primaryFrom: primaryFrom || personalAddress || undefined,
    visibleMailboxes,
    canBroadcast: body.canBroadcast === true,
    // Off unless explicitly granted — running the platform is not the same
    // permission as reading the owner's mail.
    seesPersonalMail: body.seesPersonalMail === true,
    ...(maxRecipients !== undefined ? { maxRecipients } : {}),
    updatedAt: new Date().toISOString(),
    updatedBy: caller.email,
  };

  await db.collection("emailAccess").doc(uid).set(record, { merge: true });

  return NextResponse.json({ ok: true, access: { uid, ...record } });
}
