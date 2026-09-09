import { NextResponse } from "next/server";

import { adminDb, requireAdmin } from "@/lib/firebaseAdmin";
import type { Project, Quote } from "@/lib/types";
import { clean } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only: open a project.
 *
 * Projects also open automatically when an invoice is paid, but plenty of work
 * starts the other way round — a phone call, a returning client — so this lets
 * you start one directly and attach the paperwork afterwards.
 *
 * Passing a quoteId carries the client, service and Square customer across, and
 * links the two records together.
 */
export async function POST(request: Request) {
  const caller = await requireAdmin(request);
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Not authorised." },
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
  const quoteId = clean(body.quoteId, 120);

  let quote: Quote | null = null;
  if (quoteId) {
    const snap = await db.collection("quotes").doc(quoteId).get();
    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "Quote not found." },
        { status: 404 },
      );
    }
    quote = { id: snap.id, ...snap.data() } as Quote;

    // One project per quote — otherwise the timeline forks.
    const existing = await db
      .collection("projects")
      .where("quoteId", "==", quoteId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return NextResponse.json(
        {
          ok: false,
          error: "That quote already has a project.",
          projectId: existing.docs[0].id,
        },
        { status: 409 },
      );
    }
  }

  const name = clean(body.name, 200) || quote?.name;
  const clientName = clean(body.clientName, 160) || quote?.clientName;
  const clientEmail =
    clean(body.clientEmail, 200).toLowerCase() || quote?.clientEmail;

  if (!name || !clientName) {
    return NextResponse.json(
      { ok: false, error: "A project needs a name and a client." },
      { status: 400 },
    );
  }

  // Link to an existing account when the email matches one.
  let clientId: string | null = quote?.clientId ?? null;
  if (!clientId && clientEmail) {
    const user = await db
      .collection("users")
      .where("email", "==", clientEmail)
      .limit(1)
      .get();
    if (!user.empty) clientId = user.docs[0].id;
  }

  const project: Omit<Project, "id"> = {
    clientId,
    clientName,
    clientEmail: clientEmail || undefined,
    serviceType: clean(body.serviceType, 160) || quote?.serviceType || "",
    name,
    status: "Planning",
    files: [],
    quoteId: quoteId || undefined,
    squareCustomerId: quote?.squareCustomerId,
    createdAt: new Date().toISOString(),
  };

  const ref = await db.collection("projects").add(project);

  return NextResponse.json({ ok: true, projectId: ref.id });
}
