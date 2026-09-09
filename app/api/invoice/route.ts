import { NextResponse } from "next/server";

import { sendInvoiceToClient } from "@/lib/email";
import { adminDb, requireAdmin } from "@/lib/firebaseAdmin";
import {
  createInvoice,
  findOrCreateCustomer,
  isSquareConfigured,
  publishInvoice,
  SquareApiError,
  type InvoiceDeposit,
  type InvoiceLineItem,
} from "@/lib/square";
import type { Quote } from "@/lib/types";
import { clean } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LineItemInput {
  name?: unknown;
  amountCents?: unknown;
  quantity?: unknown;
  note?: unknown;
}

/** Parses and validates the admin-supplied line items. */
function parseLineItems(raw: unknown): {
  items: InvoiceLineItem[];
  error?: string;
} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { items: [], error: "Add at least one line item." };
  }
  if (raw.length > 30) {
    return { items: [], error: "Too many line items (max 30)." };
  }

  const items: InvoiceLineItem[] = [];

  for (const entry of raw as LineItemInput[]) {
    const name = clean(entry.name, 200);
    const amountCents = Math.round(Number(entry.amountCents));
    const quantity = entry.quantity === undefined ? 1 : Number(entry.quantity);

    if (!name) return { items: [], error: "Every line item needs a name." };
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      return { items: [], error: `Invalid amount for "${name}".` };
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return { items: [], error: `Invalid quantity for "${name}".` };
    }

    items.push({
      name,
      amountCents,
      quantity,
      note: clean(entry.note, 400) || undefined,
    });
  }

  const total = items.reduce(
    (sum, item) => sum + item.amountCents * (item.quantity ?? 1),
    0,
  );
  if (total <= 0) {
    return { items: [], error: "Invoice total must be greater than zero." };
  }

  return { items };
}

/**
 * Parses the optional deposit.
 *
 * Square requires a deposit to be strictly less than the invoice total — a
 * "deposit" for the whole amount is rejected, so that's caught here with a
 * message that makes sense rather than letting Square return a raw error.
 */
function parseDeposit(
  raw: unknown,
  totalCents: number,
): { deposit?: InvoiceDeposit; depositCents?: number; error?: string } {
  if (!raw || typeof raw !== "object") return {};

  const input = raw as {
    type?: unknown;
    value?: unknown;
    dueInDays?: unknown;
  };

  const dueInDays = Number(input.dueInDays ?? 0);
  if (!Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > 90) {
    return { error: "Deposit due date must be between 0 and 90 days." };
  }

  if (input.type === "percentage") {
    const percent = Number(input.value);
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
      return { error: "Deposit percentage must be between 1 and 99." };
    }
    return {
      deposit: { percentage: String(percent), dueInDays },
      depositCents: Math.round((totalCents * percent) / 100),
    };
  }

  if (input.type === "fixed") {
    const amountCents = Math.round(Number(input.value));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return { error: "Deposit amount must be greater than zero." };
    }
    if (amountCents >= totalCents) {
      return { error: "Deposit must be less than the invoice total." };
    }
    return { deposit: { amountCents, dueInDays }, depositCents: amountCents };
  }

  return { error: `Unknown deposit type "${String(input.type)}".` };
}

/**
 * Admin-only: turn a quote into a published Square invoice.
 *
 * Creates the order and invoice, publishes it (which makes Square email the
 * customer a payment link), records the linkage on the quote, and sends our own
 * branded "your quote is ready" email with the same link.
 */
export async function POST(request: Request) {
  const caller = await requireAdmin(request);
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Not authorised." },
      { status: 403 },
    );
  }

  if (!isSquareConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Square isn't configured. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID.",
      },
      { status: 503 },
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

  const { items, error: itemsError } = parseLineItems(body.lineItems);
  if (itemsError) {
    return NextResponse.json({ ok: false, error: itemsError }, { status: 400 });
  }

  const amountCents = items.reduce(
    (sum, item) => sum + item.amountCents * (item.quantity ?? 1),
    0,
  );

  const {
    deposit,
    depositCents,
    error: depositError,
  } = parseDeposit(body.deposit, amountCents);
  if (depositError) {
    return NextResponse.json(
      { ok: false, error: depositError },
      { status: 400 },
    );
  }

  const db = adminDb();
  const quoteRef = db.collection("quotes").doc(quoteId);
  const snap = await quoteRef.get();

  if (!snap.exists) {
    return NextResponse.json(
      { ok: false, error: "Quote not found." },
      { status: 404 },
    );
  }

  const quote = { id: snap.id, ...snap.data() } as Quote;

  if (quote.squareInvoiceId) {
    return NextResponse.json(
      {
        ok: false,
        error: "This quote already has an invoice.",
        invoiceUrl: quote.squarePublicUrl,
      },
      { status: 409 },
    );
  }

  try {
    // Reuse the customer created at quote time; create one if it's missing.
    const customerId =
      quote.squareCustomerId ??
      (
        await findOrCreateCustomer({
          email: quote.clientEmail,
          name: quote.clientName,
          phone: quote.clientPhone,
        })
      ).id;

    const draft = await createInvoice({
      customerId,
      lineItems: items,
      title: clean(body.title, 200) || quote.name,
      description:
        clean(body.description, 1000) ||
        `${quote.serviceType} — prepared for ${quote.clientName}.`,
      dueInDays: Number(body.dueInDays) || 14,
      deposit,
      reminders: body.reminders !== false,
    });

    const published = await publishInvoice(draft.id, draft.version);

    const update = {
      status: "Invoiced" as const,
      squareCustomerId: customerId,
      squareInvoiceId: published.id,
      squareInvoiceNumber: published.invoice_number ?? null,
      squarePublicUrl: published.public_url ?? null,
      depositCents: depositCents ?? null,
      amountCents,
      currency: process.env.SQUARE_CURRENCY ?? "AUD",
      invoicedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await quoteRef.update(update);

    // Our own branded email, alongside Square's automatic one.
    // Built explicitly rather than spreading `update`, whose nulls are for
    // Firestore's benefit and don't match the Quote type.
    if (published.public_url) {
      const invoicedQuote: Quote = {
        ...quote,
        status: "Invoiced",
        squareCustomerId: customerId,
        squareInvoiceId: published.id,
        squareInvoiceNumber: published.invoice_number ?? undefined,
        squarePublicUrl: published.public_url,
        amountCents,
        depositCents,
        currency: update.currency,
        invoicedAt: update.invoicedAt,
      };
      await sendInvoiceToClient(invoicedQuote, published.public_url);
    }

    return NextResponse.json({
      ok: true,
      invoiceId: published.id,
      invoiceNumber: published.invoice_number,
      invoiceUrl: published.public_url,
      amountCents,
      depositCents,
    });
  } catch (err) {
    if (err instanceof SquareApiError) {
      console.error("[invoice] Square rejected the request:", err.errors);
      return NextResponse.json(
        { ok: false, error: `Square: ${err.message}` },
        { status: 502 },
      );
    }
    console.error("[invoice] failed:", err);
    return NextResponse.json(
      { ok: false, error: "Could not create the invoice." },
      { status: 500 },
    );
  }
}
