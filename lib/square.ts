/**
 * Square integration (server only).
 *
 * Talks to the Square Connect v2 REST API directly with `fetch` rather than the
 * Node SDK — the SDK has had breaking rewrites between major versions, whereas
 * the REST surface is pinned and stable via the `Square-Version` header.
 *
 * Flow this supports:
 *   1. Quote request      → findOrCreateCustomer()
 *   2. Admin sends quote  → createInvoice() then publishInvoice()
 *   3. Client pays        → webhook (see app/api/square/webhook/route.ts)
 */
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const SQUARE_VERSION = process.env.SQUARE_API_VERSION ?? "2025-01-23";

function squareBaseUrl(): string {
  const env = (process.env.SQUARE_ENVIRONMENT ?? "sandbox").toLowerCase();
  return env === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export function isSquareConfigured(): boolean {
  return Boolean(
    process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID,
  );
}

export interface SquareError {
  category?: string;
  code?: string;
  detail?: string;
  field?: string;
}

export class SquareApiError extends Error {
  readonly status: number;
  readonly errors: SquareError[];

  constructor(status: number, errors: SquareError[]) {
    const detail =
      errors.map((e) => e.detail ?? e.code).filter(Boolean).join("; ") ||
      `Square request failed with status ${status}`;
    super(detail);
    this.name = "SquareApiError";
    this.status = status;
    this.errors = errors;
  }
}

async function squareFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN is not set.");

  const response = await fetch(`${squareBaseUrl()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Square-Version": SQUARE_VERSION,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new SquareApiError(response.status, payload.errors ?? []);
  }
  return payload as T;
}

/** Square requires a unique idempotency key on every mutating call. */
function idempotencyKey(): string {
  return crypto.randomUUID();
}

// ============================================================
// Customers
// ============================================================

export interface SquareCustomer {
  id: string;
  email_address?: string;
  given_name?: string;
  family_name?: string;
  phone_number?: string;
}

/**
 * Looks a customer up by email and creates one if they don't exist yet.
 * Called when a quote request comes in, so every enquiry lands in Square.
 */
export async function findOrCreateCustomer(input: {
  email: string;
  name: string;
  phone?: string;
}): Promise<SquareCustomer> {
  const search = await squareFetch<{ customers?: SquareCustomer[] }>(
    "/v2/customers/search",
    {
      method: "POST",
      body: {
        limit: 1,
        query: {
          filter: { email_address: { exact: input.email.toLowerCase() } },
        },
      },
    },
  );

  const existing = search.customers?.[0];
  if (existing) return existing;

  const [givenName, ...rest] = input.name.trim().split(/\s+/);
  const created = await squareFetch<{ customer: SquareCustomer }>(
    "/v2/customers",
    {
      method: "POST",
      body: {
        idempotency_key: idempotencyKey(),
        given_name: givenName || input.name,
        family_name: rest.join(" ") || undefined,
        email_address: input.email.toLowerCase(),
        phone_number: input.phone || undefined,
        note: "Created from wjohnstonmedia.com quote request",
      },
    },
  );

  return created.customer;
}

// ============================================================
// Orders + Invoices
// ============================================================

export interface InvoiceLineItem {
  name: string;
  /** Price per unit in cents. */
  amountCents: number;
  quantity?: number;
  note?: string;
}

export interface SquareInvoice {
  id: string;
  version: number;
  status: string;
  invoice_number?: string;
  public_url?: string;
  order_id?: string;
  payment_requests?: { computed_amount_money?: { amount: number } }[];
}

/**
 * Creates the order + draft invoice for a quote.
 * The invoice is created as a DRAFT — call publishInvoice() to actually send it.
 */
export async function createInvoice(input: {
  customerId: string;
  lineItems: InvoiceLineItem[];
  title: string;
  description?: string;
  /** Days until payment is due. Defaults to 14. */
  dueInDays?: number;
  currency?: string;
}): Promise<SquareInvoice> {
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) throw new Error("SQUARE_LOCATION_ID is not set.");

  const currency = input.currency ?? process.env.SQUARE_CURRENCY ?? "AUD";

  // 1. An invoice must be backed by an order.
  const order = await squareFetch<{ order: { id: string } }>("/v2/orders", {
    method: "POST",
    body: {
      idempotency_key: idempotencyKey(),
      order: {
        location_id: locationId,
        customer_id: input.customerId,
        line_items: input.lineItems.map((item) => ({
          name: item.name,
          quantity: String(item.quantity ?? 1),
          note: item.note,
          base_price_money: { amount: item.amountCents, currency },
        })),
      },
    },
  });

  // 2. Draft invoice against that order.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (input.dueInDays ?? 14));

  const invoice = await squareFetch<{ invoice: SquareInvoice }>("/v2/invoices", {
    method: "POST",
    body: {
      idempotency_key: idempotencyKey(),
      invoice: {
        location_id: locationId,
        order_id: order.order.id,
        primary_recipient: { customer_id: input.customerId },
        title: input.title,
        description: input.description,
        delivery_method: "EMAIL",
        accepted_payment_methods: {
          card: true,
          bank_account: true,
        },
        payment_requests: [
          {
            request_type: "BALANCE",
            due_date: dueDate.toISOString().slice(0, 10),
            automatic_payment_source: "NONE",
          },
        ],
      },
    },
  });

  return invoice.invoice;
}

/**
 * Publishes (sends) a draft invoice. Square emails the customer a payment link
 * and the invoice becomes payable.
 */
export async function publishInvoice(
  invoiceId: string,
  version: number,
): Promise<SquareInvoice> {
  const result = await squareFetch<{ invoice: SquareInvoice }>(
    `/v2/invoices/${invoiceId}/publish`,
    {
      method: "POST",
      body: { idempotency_key: idempotencyKey(), version },
    },
  );
  return result.invoice;
}

export async function getInvoice(invoiceId: string): Promise<SquareInvoice> {
  const result = await squareFetch<{ invoice: SquareInvoice }>(
    `/v2/invoices/${invoiceId}`,
  );
  return result.invoice;
}

export async function cancelInvoice(
  invoiceId: string,
  version: number,
): Promise<SquareInvoice> {
  const result = await squareFetch<{ invoice: SquareInvoice }>(
    `/v2/invoices/${invoiceId}/cancel`,
    { method: "POST", body: { version } },
  );
  return result.invoice;
}

// ============================================================
// Webhook signature verification
// ============================================================

/**
 * Verifies the `x-square-hmacsha256-signature` header.
 *
 * Square signs the concatenation of the exact notification URL and the raw
 * request body, so the body must be the untouched string — never re-serialised
 * JSON, and the URL must match what's registered in the Square dashboard.
 */
export function verifySquareSignature(
  rawBody: string,
  signature: string | null,
  notificationUrl: string,
): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !signature) return false;

  const expected = createHmac("sha256", key)
    .update(notificationUrl + rawBody)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
