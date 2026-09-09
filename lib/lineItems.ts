import "server-only";

import { clean } from "./validation";

export interface ParsedLineItem {
  name: string;
  amountCents: number;
  quantity: number;
  note?: string;
}

/**
 * Validates admin-supplied line items for estimates and invoices.
 *
 * Shared by both so a figure can never be accepted on an estimate and then
 * rejected when the same numbers are carried into the invoice.
 */
export function parseLineItems(raw: unknown): {
  items: ParsedLineItem[];
  totalCents: number;
  error?: string;
} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { items: [], totalCents: 0, error: "Add at least one line item." };
  }
  if (raw.length > 30) {
    return { items: [], totalCents: 0, error: "Too many line items (max 30)." };
  }

  const items: ParsedLineItem[] = [];

  for (const entry of raw as Record<string, unknown>[]) {
    const name = clean(entry.name, 200);
    const amountCents = Math.round(Number(entry.amountCents));
    const quantity = entry.quantity === undefined ? 1 : Number(entry.quantity);

    if (!name) {
      return { items: [], totalCents: 0, error: "Every line item needs a name." };
    }
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      return { items: [], totalCents: 0, error: `Invalid amount for "${name}".` };
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return { items: [], totalCents: 0, error: `Invalid quantity for "${name}".` };
    }

    items.push({
      name,
      amountCents,
      quantity,
      note: clean(entry.note, 400) || undefined,
    });
  }

  const totalCents = items.reduce(
    (sum, item) => sum + item.amountCents * item.quantity,
    0,
  );

  if (totalCents <= 0) {
    return { items: [], totalCents: 0, error: "Total must be greater than zero." };
  }

  return { items, totalCents };
}
