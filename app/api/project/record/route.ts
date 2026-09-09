import { NextResponse } from "next/server";

import { adminDb, requireAdmin } from "@/lib/firebaseAdmin";
import {
  SQUARE_DOC_KINDS,
  type Project,
  type SquareDocKind,
  type SquareDocRef,
} from "@/lib/types";
import { clean, cleanMultiline } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELD: Record<SquareDocKind, "estimateRef" | "contractRef"> = {
  estimate: "estimateRef",
  contract: "contractRef",
};

/** Optional YYYY-MM-DD. */
function parseDate(value: unknown): string | undefined | null {
  const date = clean(value, 40);
  if (!date) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * Admin-only: record an estimate or contract you produced in Square.
 *
 * Square has no API for either, so nothing can be read back automatically.
 * This captures the handful of facts worth showing — reference, total, link,
 * dates — so the project timeline is complete and the client can be shown
 * where things stand.
 *
 * Nothing reaches the client until `visibleToClient` is set.
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

  const projectId = clean(body.projectId, 120);
  const kind = clean(body.kind, 20) as SquareDocKind;

  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "Missing projectId." },
      { status: 400 },
    );
  }
  if (!SQUARE_DOC_KINDS.includes(kind)) {
    return NextResponse.json(
      { ok: false, error: `Unknown document type "${kind}".` },
      { status: 400 },
    );
  }

  const sentAt = parseDate(body.sentAt);
  const resolvedAt = parseDate(body.resolvedAt);
  if (sentAt === null || resolvedAt === null) {
    return NextResponse.json(
      { ok: false, error: "Dates must be in YYYY-MM-DD form." },
      { status: 400 },
    );
  }

  const url = clean(body.url, 600);
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { ok: false, error: "The link must start with http:// or https://" },
      { status: 400 },
    );
  }

  const amount = body.amountCents;
  let amountCents: number | undefined;
  if (amount !== undefined && amount !== null && amount !== "") {
    amountCents = Math.round(Number(amount));
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      return NextResponse.json(
        { ok: false, error: "Amount must be a positive number." },
        { status: 400 },
      );
    }
  }

  const db = adminDb();
  const ref = db.collection("projects").doc(projectId);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json(
      { ok: false, error: "Project not found." },
      { status: 404 },
    );
  }

  const project = { id: snap.id, ...snap.data() } as Project;
  const existing = project[FIELD[kind]];

  const record: SquareDocRef = {
    reference: clean(body.reference, 120) || undefined,
    amountCents,
    currency: process.env.SQUARE_CURRENCY ?? "AUD",
    url: url || undefined,
    status: clean(body.status, 60) || undefined,
    sentAt,
    resolvedAt,
    note: cleanMultiline(body.note, 1000) || undefined,
    visibleToClient: body.visibleToClient === true,
    // Keep the original recording details when updating an existing entry.
    recordedAt: existing?.recordedAt ?? new Date().toISOString(),
    recordedBy: existing?.recordedBy ?? caller.email,
  };

  await ref.update({
    [FIELD[kind]]: record,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, kind, record });
}
