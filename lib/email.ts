/**
 * Transactional email via Resend (server only).
 *
 * Templates are inlined table-based HTML: email clients don't reliably load
 * webfonts or support modern CSS, so the brand is carried by colour, Georgia
 * (a serif stand-in for Playfair Display) and the copper accent rule.
 */
import "server-only";

import { Resend } from "resend";

import { formatMoney, type Estimate, type Quote } from "./types";

const FROM =
  process.env.EMAIL_FROM ?? "Johnston Media <hello@wjohnstonmedia.com>";
const OWNER_NOTIFY =
  process.env.OWNER_NOTIFY_EMAIL ?? "wjohnston.media@gmail.com";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://wjohnstonmedia.com";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

let client: Resend | null = null;

function resend(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set.");
    client = new Resend(key);
  }
  return client;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Sends an email, never throwing.
 *
 * Email is a side effect of the quote/invoice flow — a delivery failure must
 * not roll back a saved quote or a published Square invoice, so callers get a
 * result object and the failure is logged for follow-up.
 */
async function send(input: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendResult> {
  if (!isEmailConfigured()) {
    console.warn(`[email] RESEND_API_KEY missing — skipped: ${input.subject}`);
    return { ok: false, error: "email_not_configured" };
  }

  try {
    const { data, error } = await resend().emails.send({
      from: FROM,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
    });

    if (error) {
      console.error("[email] send failed:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email] send threw:", err);
    return { ok: false, error: (err as Error).message };
  }
}

// ============================================================
// Branded shell
// ============================================================

const COPPER = "#C15A32";
const BLACK = "#000000";
const SURFACE = "#0d0d0d";
const LIGHT = "#E8E8E8";
const MUTED = "#8a9aa6";

/** Escapes user-supplied text before it goes into an HTML email body. */
function esc(value: string | undefined | null): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function button(href: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
    <tr><td style="border-radius:999px;background:${COPPER};">
      <a href="${esc(href)}"
         style="display:inline-block;padding:15px 34px;font-family:Helvetica,Arial,sans-serif;
                font-size:12px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;
                color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
    </td></tr>
  </table>`;
}

function shell(opts: {
  preheader: string;
  eyebrow: string;
  heading: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BLACK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BLACK};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;background:${SURFACE};border:1px solid rgba(255,255,255,0.07);border-radius:16px;overflow:hidden;">

        <tr><td style="padding:36px 40px 0 40px;">
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;
                    letter-spacing:2.4px;text-transform:uppercase;color:${COPPER};">Johnston Media</p>
        </td></tr>

        <tr><td style="padding:24px 40px 0 40px;">
          <p style="margin:0 0 10px 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;
                    letter-spacing:1.8px;text-transform:uppercase;color:${MUTED};">${esc(opts.eyebrow)}</p>
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;
                     line-height:1.25;font-weight:normal;color:#ffffff;">${esc(opts.heading)}</h1>
          <div style="width:60px;height:2px;background:${COPPER};margin:22px 0 0 0;"></div>
        </td></tr>

        <tr><td style="padding:24px 40px 40px 40px;font-family:Helvetica,Arial,sans-serif;
                       font-size:15px;line-height:1.75;color:${LIGHT};">
          ${opts.body}
        </td></tr>

        <tr><td style="padding:26px 40px;background:#0a0a0a;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-style:italic;font-size:15px;color:${COPPER};">
            Your Vision. My Lens.
          </p>
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};">
            Johnston Media · New South Wales, Australia<br />
            <a href="${esc(SITE_URL)}" style="color:${MUTED};text-decoration:underline;">wjohnstonmedia.com</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Renders a simple label/value detail block. */
function details(rows: [string, string | undefined][]): string {
  const visible = rows.filter(([, v]) => v && String(v).trim());
  if (!visible.length) return "";
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:26px 0;border-left:2px solid ${COPPER};">
    ${visible
      .map(
        ([label, value]) => `
    <tr>
      <td style="padding:7px 0 7px 18px;font-family:Helvetica,Arial,sans-serif;font-size:11px;
                 letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};width:132px;
                 vertical-align:top;">${esc(label)}</td>
      <td style="padding:7px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;
                 color:${LIGHT};">${esc(value)}</td>
    </tr>`,
      )
      .join("")}
  </table>`;
}

// ============================================================
// Templates
// ============================================================

/** 1. Client — "we received your request". */
export function sendQuoteReceivedToClient(quote: Quote): Promise<SendResult> {
  const firstName = quote.clientName.trim().split(/\s+/)[0] || "there";
  const html = shell({
    preheader: `Thanks ${firstName} — your enquiry has landed.`,
    eyebrow: "Quote request received",
    heading: "Thanks — I've got it.",
    body: `
      <p style="margin:0 0 16px 0;">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 16px 0;">
        Thanks for reaching out about <strong style="color:#ffffff;">${esc(quote.name)}</strong>.
        Your request is in, and I'll review the details and come back to you personally
        with a quote — usually within one business day.
      </p>
      ${details([
        ["Project", quote.name],
        ["Service", quote.serviceType],
        ["Date", quote.date],
        ["Location", quote.location],
        ["Budget", quote.budget],
      ])}
      <p style="margin:0 0 16px 0;">
        You can track this request any time from your client portal.
      </p>
      ${button(`${SITE_URL}/portal`, "Open client portal")}
      <p style="margin:0;color:${MUTED};font-size:14px;">
        Replied to the wrong address? Just hit reply — this goes straight to my inbox.
      </p>`,
  });

  return send({
    to: quote.clientEmail,
    subject: `Quote request received — ${quote.name}`,
    html,
    replyTo: OWNER_NOTIFY,
  });
}

/** 2. Owner — new enquiry notification. */
export function sendQuoteAlertToOwner(quote: Quote): Promise<SendResult> {
  const html = shell({
    preheader: `${quote.clientName} — ${quote.serviceType}`,
    eyebrow: `New ${quote.source === "web" ? "web development" : "media"} enquiry`,
    heading: `New quote request from ${quote.clientName}`,
    body: `
      ${details([
        ["Name", quote.clientName],
        ["Email", quote.clientEmail],
        ["Phone", quote.clientPhone],
        ["Project", quote.name],
        ["Service", quote.serviceType],
        ["Date", quote.date],
        ["Location", quote.location],
        ["Budget", quote.budget],
      ])}
      ${
        quote.details
          ? `<p style="margin:0 0 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;
                       letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};">Details</p>
             <p style="margin:0 0 16px 0;white-space:pre-wrap;">${esc(quote.details)}</p>`
          : ""
      }
      ${button(`${SITE_URL}/admin`, "Review in admin")}`,
  });

  return send({
    to: OWNER_NOTIFY,
    subject: `New quote request — ${quote.clientName} (${quote.serviceType})`,
    html,
    replyTo: quote.clientEmail,
  });
}

/** 3. Client — quote ready, Square invoice attached. */
export function sendInvoiceToClient(
  quote: Quote,
  invoiceUrl: string,
): Promise<SendResult> {
  const firstName = quote.clientName.trim().split(/\s+/)[0] || "there";
  const currency = quote.currency ?? "AUD";
  const total =
    quote.amountCents !== undefined
      ? formatMoney(quote.amountCents, currency)
      : undefined;
  const deposit =
    quote.depositCents !== undefined && quote.depositCents !== null
      ? formatMoney(quote.depositCents, currency)
      : undefined;

  const html = shell({
    preheader: `Your quote for ${quote.name} is ready.`,
    eyebrow: "Your quote is ready",
    heading: "Your quote is ready to view.",
    body: `
      <p style="margin:0 0 16px 0;">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 16px 0;">
        I've put together the quote for <strong style="color:#ffffff;">${esc(quote.name)}</strong>.
        You can review the full breakdown and, when you're happy, accept and pay
        securely through Square using the button below.
      </p>
      ${
        deposit
          ? `<p style="margin:0 0 16px 0;">
               To lock the date in, there's a deposit of
               <strong style="color:${COPPER};">${esc(deposit)}</strong> up front —
               the balance is due later, and both are payable from the same link.
             </p>`
          : ""
      }
      ${details([
        ["Project", quote.name],
        ["Service", quote.serviceType],
        ["Date", quote.date],
        ["Deposit", deposit],
        ["Total", total],
      ])}
      ${button(invoiceUrl, "View & pay invoice")}
      <p style="margin:0;color:${MUTED};font-size:14px;">
        Questions, or want something adjusted? Reply to this email and we'll sort it out.
      </p>`,
  });

  return send({
    to: quote.clientEmail,
    subject: `Your quote is ready — ${quote.name}`,
    html,
    replyTo: OWNER_NOTIFY,
  });
}

/**
 * 4. Client — payment received.
 *
 * `partial` is the deposit case: the date is locked but the balance is still
 * to come, so the copy says so rather than implying the job is settled.
 */
export function sendPaymentReceiptToClient(
  quote: Quote,
  opts: { partial?: boolean } = {},
): Promise<SendResult> {
  const firstName = quote.clientName.trim().split(/\s+/)[0] || "there";
  const currency = quote.currency ?? "AUD";
  const partial = Boolean(opts.partial);

  const paid =
    partial && quote.depositCents !== undefined
      ? formatMoney(quote.depositCents, currency)
      : quote.amountCents !== undefined
        ? formatMoney(quote.amountCents, currency)
        : undefined;

  const outstanding =
    partial &&
    quote.amountCents !== undefined &&
    quote.depositCents !== undefined
      ? formatMoney(quote.amountCents - quote.depositCents, currency)
      : undefined;

  const html = shell({
    preheader: partial
      ? `Deposit received for ${quote.name} — your date is locked in.`
      : `Payment received for ${quote.name} — thank you.`,
    eyebrow: partial ? "Deposit received" : "Payment received",
    heading: partial
      ? "Your date is locked in."
      : "Thank you — payment received.",
    body: `
      <p style="margin:0 0 16px 0;">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 16px 0;">
        ${
          partial
            ? `Your deposit for <strong style="color:#ffffff;">${esc(quote.name)}</strong> has
               come through and the date is now held. The balance is due closer to
               delivery — you can pay it from the same invoice link whenever suits.`
            : `Your payment for <strong style="color:#ffffff;">${esc(quote.name)}</strong> has come
               through. Everything's locked in — I'll be in touch shortly with next steps
               and scheduling.`
        }
      </p>
      ${details([
        ["Project", quote.name],
        [partial ? "Deposit paid" : "Amount paid", paid],
        ["Balance remaining", outstanding],
        ["Invoice", quote.squareInvoiceNumber],
      ])}
      <p style="margin:0 0 16px 0;">
        You can follow the project's progress in your portal at any time.
      </p>
      ${button(`${SITE_URL}/portal`, "View project")}
      <p style="margin:0;color:${MUTED};font-size:14px;">Looking forward to making this one count.</p>`,
  });

  return send({
    to: quote.clientEmail,
    subject: partial
      ? `Deposit received — ${quote.name}`
      : `Payment received — ${quote.name}`,
    html,
    replyTo: OWNER_NOTIFY,
  });
}

/** 5. Owner — payment landed (deposit or in full). */
export function sendPaymentAlertToOwner(
  quote: Quote,
  opts: { partial?: boolean } = {},
): Promise<SendResult> {
  const currency = quote.currency ?? "AUD";
  const partial = Boolean(opts.partial);

  const paid =
    partial && quote.depositCents !== undefined
      ? formatMoney(quote.depositCents, currency)
      : quote.amountCents !== undefined
        ? formatMoney(quote.amountCents, currency)
        : "—";

  const outstanding =
    partial &&
    quote.amountCents !== undefined &&
    quote.depositCents !== undefined
      ? formatMoney(quote.amountCents - quote.depositCents, currency)
      : undefined;

  const html = shell({
    preheader: `${quote.clientName} paid ${paid}.`,
    eyebrow: partial ? "Deposit received" : "Payment received",
    heading: partial
      ? `${quote.clientName} paid the deposit.`
      : `${quote.clientName} has paid.`,
    body: `
      ${details([
        ["Client", quote.clientName],
        ["Email", quote.clientEmail],
        ["Project", quote.name],
        [partial ? "Deposit" : "Amount", paid],
        ["Still owing", outstanding],
        ["Invoice", quote.squareInvoiceNumber],
      ])}
      ${button(`${SITE_URL}/admin`, "Open admin")}`,
  });

  return send({
    to: OWNER_NOTIFY,
    subject: partial
      ? `Deposit paid — ${quote.clientName} · ${paid}`
      : `Paid — ${quote.clientName} · ${paid}`,
    html,
  });
}

/** 6. Client — project stage moved. */
export function sendProjectStageUpdate(input: {
  clientName: string;
  clientEmail: string;
  projectName: string;
  stage: string;
}): Promise<SendResult> {
  const firstName = input.clientName.trim().split(/\s+/)[0] || "there";
  const copy: Record<string, string> = {
    Planning: "We're mapping out the shoot — locations, timings and shot list.",
    Shooting: "Cameras are rolling. Your project is in production.",
    Editing: "Footage is in and the edit is underway — grading and cutting.",
    Delivering: "The edit is locked. Final files are being prepared for delivery.",
    Delivered: "Everything's delivered and ready for you in the portal.",
  };

  const html = shell({
    preheader: `${input.projectName} is now at: ${input.stage}`,
    eyebrow: "Project update",
    heading: `${input.projectName} — ${input.stage}`,
    body: `
      <p style="margin:0 0 16px 0;">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 16px 0;">
        Quick update: <strong style="color:#ffffff;">${esc(input.projectName)}</strong> has moved
        to <strong style="color:${COPPER};">${esc(input.stage)}</strong>.
      </p>
      <p style="margin:0 0 16px 0;color:${MUTED};">${esc(copy[input.stage] ?? "")}</p>
      ${button(`${SITE_URL}/portal`, "View in portal")}`,
  });

  return send({
    to: input.clientEmail,
    subject: `${input.projectName} — ${input.stage}`,
    html,
    replyTo: OWNER_NOTIFY,
  });
}

/** 7. Owner — contact form submission. */
export function sendContactAlertToOwner(input: {
  name: string;
  email: string;
  message: string;
}): Promise<SendResult> {
  const html = shell({
    preheader: input.message.slice(0, 120),
    eyebrow: "Contact form",
    heading: `Message from ${input.name}`,
    body: `
      ${details([
        ["Name", input.name],
        ["Email", input.email],
      ])}
      <p style="margin:0 0 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;
                letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};">Message</p>
      <p style="margin:0;white-space:pre-wrap;">${esc(input.message)}</p>`,
  });

  return send({
    to: OWNER_NOTIFY,
    subject: `Website message — ${input.name}`,
    html,
    replyTo: input.email,
  });
}

/** Renders an estimate's line items as a table the client can read. */
function lineItemTable(estimate: Estimate): string {
  const currency = estimate.currency || "AUD";

  const rows = estimate.lineItems
    .map((item) => {
      const qty = item.quantity ?? 1;
      const line = item.amountCents * qty;
      return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07);
                   font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${LIGHT};">
          ${esc(item.name)}${qty > 1 ? ` <span style="color:${MUTED};">× ${qty}</span>` : ""}
          ${item.note ? `<br /><span style="font-size:12px;color:${MUTED};">${esc(item.note)}</span>` : ""}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07);
                   font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${LIGHT};
                   text-align:right;white-space:nowrap;">${esc(formatMoney(line, currency))}</td>
      </tr>`;
    })
    .join("");

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;">
    ${rows}
    <tr>
      <td style="padding:16px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;
                 letter-spacing:1.6px;text-transform:uppercase;color:${MUTED};">Total</td>
      <td style="padding:16px 0 0 0;font-family:Georgia,serif;font-size:22px;color:${COPPER};
                 text-align:right;white-space:nowrap;">${esc(formatMoney(estimate.totalCents, currency))}</td>
    </tr>
  </table>`;
}

/** 8. Client — here's your estimate, accept or decline in the portal. */
export function sendEstimateToClient(quote: Quote): Promise<SendResult> {
  const firstName = quote.clientName.trim().split(/\s+/)[0] || "there";
  const estimate = quote.estimate;
  if (!estimate) {
    return Promise.resolve({ ok: false, error: "no_estimate" });
  }

  const html = shell({
    preheader: `Your estimate for ${quote.name} — ${formatMoney(estimate.totalCents, estimate.currency)}`,
    eyebrow: "Your estimate",
    heading: "Here's what it would take.",
    body: `
      <p style="margin:0 0 16px 0;">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 16px 0;">
        I've put together an estimate for <strong style="color:#ffffff;">${esc(quote.name)}</strong>.
        Have a look through the breakdown below — nothing is charged at this stage.
      </p>
      ${estimate.notes ? `<p style="margin:0 0 16px 0;white-space:pre-wrap;">${esc(estimate.notes)}</p>` : ""}
      ${lineItemTable(estimate)}
      ${
        estimate.validUntil
          ? `<p style="margin:0 0 16px 0;color:${MUTED};font-size:14px;">
               This estimate holds until <strong style="color:${LIGHT};">${esc(estimate.validUntil)}</strong>.
             </p>`
          : ""
      }
      <p style="margin:0 0 16px 0;">
        Happy with it? Accept in your portal and I'll send the invoice through.
        If something needs changing, decline and tell me what — no hard feelings.
      </p>
      ${button(`${SITE_URL}/portal`, "Review the estimate")}
      <p style="margin:0;color:${MUTED};font-size:14px;">
        Questions first? Just reply to this email.
      </p>`,
  });

  return send({
    to: quote.clientEmail,
    subject: `Your estimate — ${quote.name}`,
    html,
    replyTo: OWNER_NOTIFY,
  });
}

/** 9. Owner — the client answered the estimate. */
export function sendEstimateReplyToOwner(
  quote: Quote,
  accepted: boolean,
): Promise<SendResult> {
  const estimate = quote.estimate;
  const total = estimate
    ? formatMoney(estimate.totalCents, estimate.currency)
    : "—";

  const html = shell({
    preheader: `${quote.clientName} ${accepted ? "accepted" : "declined"} the estimate for ${quote.name}.`,
    eyebrow: accepted ? "Estimate accepted" : "Estimate declined",
    heading: accepted
      ? `${quote.clientName} said yes.`
      : `${quote.clientName} declined.`,
    body: `
      ${details([
        ["Client", quote.clientName],
        ["Email", quote.clientEmail],
        ["Project", quote.name],
        ["Estimate", total],
        ...(estimate?.declineReason
          ? ([["Reason", estimate.declineReason]] as [string, string][])
          : []),
      ])}
      <p style="margin:0 0 16px 0;">
        ${
          accepted
            ? "The invoice builder is pre-loaded with these figures — one click to send it."
            : "Worth a follow-up while it's fresh."
        }
      </p>
      ${button(`${SITE_URL}/admin`, "Open admin")}`,
  });

  return send({
    to: OWNER_NOTIFY,
    subject: accepted
      ? `Accepted — ${quote.clientName} · ${total}`
      : `Declined — ${quote.clientName} · ${quote.name}`,
    html,
    replyTo: quote.clientEmail,
  });
}
