import { NextResponse } from "next/server";

import { sendEstimateToClient } from "@/lib/email";
import { adminDb, requireAdmin } from "@/lib/firebaseAdmin";
import { parseLineItems } from "@/lib/lineItems";
import type { Estimate, Quote } from "@/lib/types";
import { clean, cleanMultiline } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Statuses where sending (or re-sending) an estimate still makes sense. */
const SENDABLE = new Set([
  "Pending",
  "Reviewed",
  "Estimate Sent",
  "Declined",
  "Sent",
]);

/**
 * Admin-only: send an estimate for a quote.
 *
 * Square has no public Estimates API, so this is entirely ours: the estimate
 * is stored on the quote, emailed to the client, and answered in the portal.
 * Only once it's accepted does Square get involved, via /api/invoice.
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

  const quoteId = clean(body.quoteId, 120);
  if (!quoteId) {
    return NextResponse.json(
      { ok: false, error: "Missing quoteId." },
      { status: 400 },
    );
  }

  const { items, totalCents, error } = parseLineItems(body.lineItems);
  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  const validUntil = clean(body.validUntil, 40) || undefined;
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return NextResponse.json(
      { ok: false, error: "Valid-until must be a date." },
      { status: 400 },
    );
  }

  const db = adminDb();
  const ref = db.collection("quotes").doc(quoteId);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json(
      { ok: false, error: "Quote not found." },
      { status: 404 },
    );
  }

  const quote = { id: snap.id, ...snap.data() } as Quote;

  if (quote.squareInvoiceId) {
    return NextResponse.json(
      { ok: false, error: "This quote has already been invoiced." },
      { status: 409 },
    );
  }
  if (!SENDABLE.has(quote.status)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Can't send an estimate for a quote that's ${quote.status}.`,
      },
      { status: 409 },
    );
  }

  const estimate: Estimate = {
    lineItems: items,
    totalCents,
    currency: process.env.SQUARE_CURRENCY ?? "AUD",
    notes: cleanMultiline(body.notes, 2000) || undefined,
    validUntil,
    sentAt: new Date().toISOString(),
    sentBy: caller.email,
  };

  await ref.update({
    estimate,
    status: "Estimate Sent",
    updatedAt: new Date().toISOString(),
  });

  const emailed = await sendEstimateToClient({ ...quote, estimate });

  return NextResponse.json({
    ok: true,
    totalCents,
    emailed: emailed.ok,
    // Surfaced so the admin toast can be honest when Resend isn't configured.
    emailError: emailed.ok ? undefined : emailed.error,
  });
}
