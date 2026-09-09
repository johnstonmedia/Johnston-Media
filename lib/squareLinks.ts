/**
 * Links out to Square, for the admin panel.
 *
 * Square publishes the customer-facing `public_url` on an invoice but does not
 * document a deep-link format for the seller Dashboard, so we don't invent one:
 * by default these fall back to the relevant Dashboard section, which is one
 * search away from the record. Set the env templates below (using `{id}` as the
 * placeholder) once you've copied a real URL out of your own Dashboard, and the
 * links become direct.
 */

export const SQUARE_DASHBOARD = {
  projects: "https://app.squareup.com/dashboard/projects",
  invoices: "https://app.squareup.com/dashboard/invoices",
  estimates: "https://app.squareup.com/dashboard/invoices/estimates",
  customers: "https://app.squareup.com/dashboard/customers",
} as const;

function fromTemplate(
  template: string | undefined,
  id: string | undefined,
): string | null {
  if (!template || !id) return null;
  return template.includes("{id}") ? template.replace("{id}", id) : null;
}

/** Direct link to an invoice in the Square Dashboard, when configured. */
export function squareInvoiceUrl(invoiceId?: string): string | null {
  return fromTemplate(
    process.env.NEXT_PUBLIC_SQUARE_DASHBOARD_INVOICE_URL,
    invoiceId,
  );
}

/** Direct link to a customer in the Square Dashboard, when configured. */
export function squareCustomerUrl(customerId?: string): string | null {
  return fromTemplate(
    process.env.NEXT_PUBLIC_SQUARE_DASHBOARD_CUSTOMER_URL,
    customerId,
  );
}
