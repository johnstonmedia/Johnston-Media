import { NextResponse } from "next/server";

import { sendPaymentAlertToOwner, sendPaymentReceiptToClient } from "@/lib/email";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifySquareSignature } from "@/lib/square";
import type { Quote, QuoteStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Maps a Square invoice status onto our quote status.
 *
 * PARTIALLY_PAID is the deposit case: on a deposit + balance invoice Square
 * reports it once the deposit clears, which confirms the booking without
 * settling the invoice — so it gets its own status rather than being folded
 * into Paid.
 *
 * Returns null for statuses that shouldn't move the quote (DRAFT, UNPAID,
 * SCHEDULED, PAYMENT_PENDING).
 */
function mapInvoiceStatus(squareStatus: string): QuoteStatus | null {
  switch (squareStatus) {
    case "PAID":
      return "Paid";
    case "PARTIALLY_PAID":
      return "Deposit Paid";
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "Refunded";
    case "CANCELED":
      return "Cancelled";
    case "FAILED":
      return "Declined";
    default:
      return null;
  }
}

/** Statuses that mean money has landed and the project should be underway. */
const MONEY_IN: readonly QuoteStatus[] = ["Paid", "Deposit Paid"];

interface SquareWebhookEvent {
  type?: string;
  event_id?: string;
  data?: {
    object?: {
      invoice?: {
        id?: string;
        status?: string;
        invoice_number?: string;
        public_url?: string;
        payment_requests?: {
          computed_amount_money?: { amount?: number; currency?: string };
          total_completed_amount_money?: { amount?: number; currency?: string };
        }[];
      };
    };
  };
}

/**
 * Square webhook receiver.
 *
 * Subscribe to `invoice.payment_made` and `invoice.updated` in the Square
 * dashboard and point them at:  https://<your-domain>/api/square/webhook
 *
 * The signature covers the exact notification URL plus the raw body, so the
 * body must be read as text and SQUARE_WEBHOOK_NOTIFICATION_URL must match the
 * URL registered with Square character for character.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");

  const notificationUrl =
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL ?? request.url;

  if (!verifySquareSignature(rawBody, signature, notificationUrl)) {
    console.warn("[square-webhook] rejected: bad signature");
    return NextResponse.json(
      { ok: false, error: "Invalid signature." },
      { status: 401 },
    );
  }

  let event: SquareWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON." },
      { status: 400 },
    );
  }

  const invoice = event.data?.object?.invoice;
  if (!invoice?.id) {
    // Not an invoice event we care about — acknowledge so Square stops retrying.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const db = adminDb();

  // Idempotency: Square retries, and duplicate events must not double-send email.
  if (event.event_id) {
    const eventRef = db.collection("squareEvents").doc(event.event_id);
    const seen = await eventRef.get();
    if (seen.exists) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    await eventRef.set({
      type: event.type ?? "unknown",
      invoiceId: invoice.id,
      receivedAt: new Date().toISOString(),
    });
  }

  const matches = await db
    .collection("quotes")
    .where("squareInvoiceId", "==", invoice.id)
    .limit(1)
    .get();

  if (matches.empty) {
    console.warn(`[square-webhook] no quote for invoice ${invoice.id}`);
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const doc = matches.docs[0];
  const quote = { id: doc.id, ...doc.data() } as Quote;
  const status = invoice.status ?? "";

  // Keep the public link fresh regardless of status.
  const update: Record<string, unknown> = {
    squareInvoiceStatus: status,
    updatedAt: new Date().toISOString(),
  };
  if (invoice.public_url) update.squarePublicUrl = invoice.public_url;
  if (invoice.invoice_number) update.squareInvoiceNumber = invoice.invoice_number;

  const mapped = mapInvoiceStatus(status);

  // Nothing meaningful changed — just mirror the Square fields and stop.
  if (!mapped || mapped === quote.status) {
    await doc.ref.update(update);
    return NextResponse.json({ ok: true, status });
  }

  update.status = mapped;

  // ─── Money in: deposit cleared, or invoice settled in full ───
  if (MONEY_IN.includes(mapped)) {
    const partial = mapped === "Deposit Paid";

    const collected = invoice.payment_requests?.reduce(
      (sum, request) =>
        sum + (request.total_completed_amount_money?.amount ?? 0),
      0,
    );

    if (partial) {
      if (collected) update.depositPaidCents = collected;
      update.depositPaidAt = new Date().toISOString();
    } else {
      update.paidAt = new Date().toISOString();
      if (collected) update.amountCents = collected;
    }

    await doc.ref.update(update);

    const settledQuote: Quote = {
      ...quote,
      status: mapped,
      amountCents: partial ? quote.amountCents : (collected ?? quote.amountCents),
      depositCents: partial ? (collected ?? quote.depositCents) : quote.depositCents,
      squareInvoiceNumber: invoice.invoice_number ?? quote.squareInvoiceNumber,
    };

    // Open a project on the FIRST payment — a paid deposit confirms the
    // booking, so the client should see progress without waiting for the
    // balance to clear.
    try {
      const existingProject = await db
        .collection("projects")
        .where("quoteId", "==", quote.id)
        .limit(1)
        .get();

      if (existingProject.empty) {
        await db.collection("projects").add({
          clientId: quote.clientId ?? null,
          clientName: quote.clientName,
          clientEmail: quote.clientEmail,
          serviceType: quote.serviceType,
          name: quote.name,
          status: "Planning",
          quoteId: quote.id,
          files: [],
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("[square-webhook] project creation failed:", err);
    }

    await Promise.all([
      sendPaymentReceiptToClient(settledQuote, { partial }),
      sendPaymentAlertToOwner(settledQuote, { partial }),
    ]);

    return NextResponse.json({ ok: true, status: mapped });
  }

  // ─── Cancelled, refunded or failed ───────────────────────────
  // No client email here: these follow an action you took in Square, or a
  // refund you've already discussed. The status change is what matters, so the
  // portal stops offering a dead payment link.
  if (mapped === "Refunded") {
    update.refundedAt = new Date().toISOString();
  }

  await doc.ref.update(update);
  console.info(
    `[square-webhook] quote ${quote.id} → ${mapped} (Square: ${status})`,
  );

  return NextResponse.json({ ok: true, status: mapped });
}
