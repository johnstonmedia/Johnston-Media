import { NextResponse } from "next/server";

import { sendQuoteAlertToOwner, sendQuoteReceivedToClient } from "@/lib/email";
import { adminDb } from "@/lib/firebaseAdmin";
import { findPackage } from "@/lib/packages";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { findOrCreateCustomer, isSquareConfigured } from "@/lib/square";
import type { Quote } from "@/lib/types";
import { validateQuote } from "@/lib/validation";

/** firebase-admin needs the Node runtime — it can't run on the edge. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public quote request endpoint.
 *
 * Used by both the media contact page and the web-development page; `source`
 * distinguishes them so the admin panel and emails can be labelled correctly.
 *
 * Order of operations matters: the quote is persisted FIRST, so a Square or
 * Resend outage can never lose an enquiry. Those integrations are best-effort
 * and their failures are recorded on the document instead of failing the request.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`quote:${clientIp(request)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
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

  const { errors, value } = validateQuote(body);

  // Honeypot: silently accept so bots don't learn they were caught.
  if (value.company) {
    return NextResponse.json({ ok: true, id: "ignored" });
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const now = new Date().toISOString();

  const quoteData: Omit<Quote, "id"> = {
    clientId: null,
    clientName: value.name,
    clientEmail: value.email,
    clientPhone: value.phone || undefined,
    serviceType: value.serviceType,
    source: value.source,
    // Only store ids we actually know, so a tampered form can't write junk.
    packageId: findPackage(value.packageId) ? value.packageId : undefined,
    name: value.projectName,
    date: value.date || undefined,
    location: value.location || undefined,
    budget: value.budget || undefined,
    details: value.details || undefined,
    status: "Pending",
    createdAt: now,
  };

  let quoteId: string;
  try {
    const db = adminDb();

    // Link the quote to an existing user account when the email matches one.
    const existingUser = await db
      .collection("users")
      .where("email", "==", value.email)
      .limit(1)
      .get();
    if (!existingUser.empty) {
      quoteData.clientId = existingUser.docs[0].id;
    }

    const ref = await db.collection("quotes").add(quoteData);
    quoteId = ref.id;
  } catch (err) {
    console.error("[quote] failed to save:", err);
    return NextResponse.json(
      { ok: false, error: "Could not save your request. Please try again." },
      { status: 500 },
    );
  }

  const quote: Quote = { id: quoteId, ...quoteData };

  // ─── Best-effort follow-ups ──────────────────────────────
  // Create the Square customer up front so invoicing later is one click.
  if (isSquareConfigured()) {
    try {
      const customer = await findOrCreateCustomer({
        email: value.email,
        name: value.name,
        phone: value.phone,
      });
      quote.squareCustomerId = customer.id;
      await adminDb()
        .collection("quotes")
        .doc(quoteId)
        .update({ squareCustomerId: customer.id });
    } catch (err) {
      console.error("[quote] Square customer sync failed:", err);
    }
  }

  const [clientEmail, ownerEmail] = await Promise.all([
    sendQuoteReceivedToClient(quote),
    sendQuoteAlertToOwner(quote),
  ]);

  if (!clientEmail.ok || !ownerEmail.ok) {
    // Recorded so a failed notification is visible in the admin panel.
    await adminDb()
      .collection("quotes")
      .doc(quoteId)
      .update({
        emailStatus: {
          client: clientEmail.ok ? "sent" : (clientEmail.error ?? "failed"),
          owner: ownerEmail.ok ? "sent" : (ownerEmail.error ?? "failed"),
        },
      })
      .catch(() => undefined);
  }

  return NextResponse.json({ ok: true, id: quoteId });
}
