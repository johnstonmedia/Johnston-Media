import { NextResponse } from "next/server";

import { sendEstimateReplyToOwner } from "@/lib/email";
import { adminDb, getCaller } from "@/lib/firebaseAdmin";
import { isEstimateOpen, type Quote } from "@/lib/types";
import { clean, cleanMultiline } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Client-facing: accept or decline an estimate.
 *
 * Goes through the server rather than a direct Firestore write so the client
 * can't set their own status, and so the owner notification always fires with
 * the decision.
 */
export async function POST(request: Request) {
  const caller = await getCaller(request);
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Please sign in again." },
      { status: 401 },
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
  const decision = clean(body.decision, 20);

  if (!quoteId) {
    return NextResponse.json(
      { ok: false, error: "Missing quoteId." },
      { status: 400 },
    );
  }
  if (decision !== "accept" && decision !== "decline") {
    return NextResponse.json(
      { ok: false, error: "Decision must be accept or decline." },
      { status: 400 },
    );
  }

  const db = adminDb();
  const ref = db.collection("quotes").doc(quoteId);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json(
      { ok: false, error: "Estimate not found." },
      { status: 404 },
    );
  }

  const quote = { id: snap.id, ...snap.data() } as Quote;

  // Ownership: quotes are linked by uid, or by the email the client typed in
  // before they had an account.
  const ownsQuote =
    quote.clientId === caller.uid ||
    quote.clientEmail.toLowerCase() === caller.email.toLowerCase();

  if (!ownsQuote) {
    // Deliberately "not found" rather than "forbidden" — no need to confirm
    // that someone else's quote exists.
    return NextResponse.json(
      { ok: false, error: "Estimate not found." },
      { status: 404 },
    );
  }

  if (!isEstimateOpen(quote)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This estimate is no longer open — it may have expired or already been answered.",
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const accepted = decision === "accept";
  const reason = cleanMultiline(body.reason, 1000) || undefined;

  const estimate = {
    ...quote.estimate!,
    ...(accepted
      ? { acceptedAt: now }
      : { declinedAt: now, ...(reason ? { declineReason: reason } : {}) }),
  };

  await ref.update({
    estimate,
    status: accepted ? "Accepted" : "Declined",
    // Link the quote to the account now that we know who they are.
    ...(quote.clientId ? {} : { clientId: caller.uid }),
    updatedAt: now,
  });

  await sendEstimateReplyToOwner({ ...quote, estimate }, accepted);

  return NextResponse.json({ ok: true, status: accepted ? "Accepted" : "Declined" });
}
