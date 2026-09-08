import { NextResponse } from "next/server";

import { sendPaymentAlertToOwner, sendPaymentReceiptToClient } from "@/lib/email";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifySquareSignature } from "@/lib/square";
import type { Quote } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Square invoice statuses that mean the money has landed. */
const PAID_STATUSES = new Set(["PAID", "PARTIALLY_PAID"]);

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

  const alreadyPaid = quote.status === "Paid";
  const nowPaid = PAID_STATUSES.has(status);

  if (nowPaid && !alreadyPaid) {
    const paidAmount =
      invoice.payment_requests?.[0]?.total_completed_amount_money?.amount ??
      invoice.payment_requests?.[0]?.computed_amount_money?.amount ??
      quote.amountCents;

    update.status = "Paid";
    update.paidAt = new Date().toISOString();
    if (paidAmount !== undefined) update.amountCents = paidAmount;

    await doc.ref.update(update);

    const paidQuote: Quote = {
      ...quote,
      status: "Paid",
      amountCents: paidAmount,
      squareInvoiceNumber: invoice.invoice_number ?? quote.squareInvoiceNumber,
    };

    // Open a project automatically so the client sees progress immediately.
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
      sendPaymentReceiptToClient(paidQuote),
      sendPaymentAlertToOwner(paidQuote),
    ]);

    return NextResponse.json({ ok: true, status: "paid" });
  }

  await doc.ref.update(update);
  return NextResponse.json({ ok: true, status });
}
