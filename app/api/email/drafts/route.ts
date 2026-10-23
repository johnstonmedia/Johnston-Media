import { NextResponse } from "next/server";

import { getEmailCaller } from "@/lib/emailAccess";
import type { EmailDraft } from "@/lib/emailTypes";
import { adminDb } from "@/lib/firebaseAdmin";
import { clean, cleanMultiline } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Drafts — everything half-written, kept without being asked.
 *
 * The rule is that nothing typed is ever lost: close the window mid-sentence,
 * lose the connection, answer the door, and the words are still there. So the
 * composer and the reply box both save as you type, and a draft is a row here
 * rather than something in the browser — a draft stranded in one laptop's
 * local storage is a draft you cannot find from your phone.
 *
 * Drafts are per-person, not per-mailbox. Something you started writing and
 * have not sent is yours: a half-finished reply says more about the person
 * writing it than about the conversation, and nobody else in the business
 * needs to read it over your shoulder.
 *
 * They are saved through an API route rather than written straight from the
 * browser so that ownership is enforced server-side, where it cannot be
 * argued with, and so this works without waiting on a rules deploy.
 */

/** Addresses are kept exactly as typed — a half-typed one must survive too. */
function line(value: unknown): string {
  return clean(value, 600);
}

/** What a draft holds, cleaned. Absent fields come back as empty strings. */
function fields(body: Record<string, unknown>) {
  return {
    kind: body.kind === "reply" ? ("reply" as const) : ("compose" as const),
    threadId: clean(body.threadId, 120),
    threadSubject: clean(body.threadSubject, 300),
    from: clean(body.from, 200).toLowerCase(),
    to: line(body.to),
    cc: line(body.cc),
    bcc: line(body.bcc),
    subject: clean(body.subject, 300),
    recipientName: clean(body.recipientName, 120),
    message: cleanMultiline(body.message, 20000),
    templateId: clean(body.templateId, 120),
    // The template's own slots, whatever they are. Stored as given rather
    // than enumerated, so adding a slot to a template needs nothing here.
    extras:
      body.extras && typeof body.extras === "object"
        ? Object.fromEntries(
            Object.entries(body.extras as Record<string, unknown>)
              .slice(0, 30)
              .map(([key, value]) => [clean(key, 60), clean(value, 400)]),
          )
        : {},
  };
}

/** A draft with nothing in it is not a draft. */
function empty(draft: ReturnType<typeof fields>): boolean {
  return (
    !draft.to &&
    !draft.cc &&
    !draft.bcc &&
    !draft.subject &&
    !draft.recipientName &&
    !draft.message &&
    Object.values(draft.extras).every((value) => !value)
  );
}

export async function GET(request: Request) {
  const caller = await getEmailCaller(request);
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Sign in to see your drafts." },
      { status: 403 },
    );
  }

  const snap = await adminDb()
    .collection("emailDrafts")
    .where("uid", "==", caller.uid)
    .limit(200)
    .get();

  const drafts = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as EmailDraft)
    // Sorted here rather than in the query: ordering on a second field needs
    // a composite index, and two hundred rows is nothing to sort.
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  return NextResponse.json({ ok: true, drafts });
}

/**
 * Saves a draft, creating it on the first keystroke and updating it after.
 *
 * A draft that has been emptied out is deleted rather than kept as a blank
 * row, because a Drafts folder full of nothing is how people learn to ignore
 * it.
 */
export async function POST(request: Request) {
  const caller = await getEmailCaller(request);
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Sign in to save a draft." },
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

  const db = adminDb();
  const id = clean(body.id, 120);
  const draft = fields(body);
  const now = new Date().toISOString();

  if (id) {
    const ref = db.collection("emailDrafts").doc(id);
    const snap = await ref.get();
    // Yours to change, nobody else's.
    if (!snap.exists || snap.data()?.uid !== caller.uid) {
      return NextResponse.json(
        { ok: false, error: "That isn't one of your drafts." },
        { status: 404 },
      );
    }

    if (empty(draft)) {
      await ref.delete();
      return NextResponse.json({ ok: true, id: null, deleted: true });
    }

    await ref.update({ ...draft, updatedAt: now });
    return NextResponse.json({ ok: true, id, savedAt: now });
  }

  // Nothing typed yet, so there is nothing to keep.
  if (empty(draft)) {
    return NextResponse.json({ ok: true, id: null });
  }

  const ref = await db.collection("emailDrafts").add({
    ...draft,
    uid: caller.uid,
    email: caller.email,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true, id: ref.id, savedAt: now });
}

/** Throws one away — on send, or because they asked. */
export async function DELETE(request: Request) {
  const caller = await getEmailCaller(request);
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Sign in to delete a draft." },
      { status: 403 },
    );
  }

  const id = clean(new URL(request.url).searchParams.get("id"), 120);
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Which draft?" },
      { status: 400 },
    );
  }

  const ref = adminDb().collection("emailDrafts").doc(id);
  const snap = await ref.get();

  // Already gone is the outcome they wanted, so it is not an error.
  if (!snap.exists) return NextResponse.json({ ok: true });

  if (snap.data()?.uid !== caller.uid) {
    return NextResponse.json(
      { ok: false, error: "That isn't one of your drafts." },
      { status: 404 },
    );
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
