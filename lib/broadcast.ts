import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { Campaign, Contact, EmailTemplate } from "./emailTypes";
import { SITE_URL } from "@/lib/siteUrl";

const RESEND_API = "https://api.resend.com";
const KEY = process.env.RESEND_API_KEY;

/**
 * Resend accepts up to 100 messages per batch call. Bigger batches are not
 * faster — they just fail as a unit — so this is both the API limit and the
 * blast radius of one bad request.
 */
const BATCH_SIZE = 100;

/**
 * Secret used to sign unsubscribe links.
 *
 * Falls back to the Resend key so a deployment can't accidentally ship
 * unsigned links, but it should be set to its own value.
 */
const UNSUB_SECRET =
  process.env.EMAIL_UNSUBSCRIBE_SECRET ?? process.env.RESEND_API_KEY ?? "";

const SITE = SITE_URL;

/**
 * A signed, one-click unsubscribe link.
 *
 * Signed rather than a bare id so that nobody can unsubscribe somebody else by
 * editing a URL, and so the link keeps working without a lookup table.
 */
export function unsubscribeUrl(contactId: string, email: string): string {
  const payload = `${contactId}:${email.toLowerCase()}`;
  const sig = createHmac("sha256", UNSUB_SECRET)
    .update(payload)
    .digest("base64url");
  return `${SITE}/api/email/unsubscribe?c=${encodeURIComponent(contactId)}&e=${encodeURIComponent(email)}&s=${sig}`;
}

export function verifyUnsubscribe(
  contactId: string,
  email: string,
  sig: string,
): boolean {
  const expected = createHmac("sha256", UNSUB_SECRET)
    .update(`${contactId}:${email.toLowerCase()}`)
    .digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Replaces {{tokens}} in a string. Unknown tokens are left alone. */
export function merge(
  source: string,
  values: Record<string, string>,
): string {
  return source.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, token: string) => {
    const value = values[token.toLowerCase()];
    return value === undefined ? whole : value;
  });
}

/** Escapes a value being dropped into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface RenderedEmail {
  to: string;
  subject: string;
  html: string;
  headers: Record<string, string>;
}

/**
 * Builds one recipient's email.
 *
 * Contact-supplied values are HTML-escaped on the way in: a name is data, and
 * a contact list is exactly the kind of place a stray `<script>` ends up.
 */
export function renderForContact(
  campaign: Campaign,
  contact: Contact,
  template: EmailTemplate | null,
  senderAddress: string,
): RenderedEmail {
  const unsub = unsubscribeUrl(contact.id, contact.email);

  const full = contact.name?.trim() || "there";
  // Templates greet with a first name; a contact record often holds a full one.
  const first = full.split(/\s+/)[0] || full;

  const values: Record<string, string> = {
    name: escapeHtml(full),
    first_name: escapeHtml(first),
    email: escapeHtml(contact.email),
    subject: escapeHtml(campaign.subject),
    preheader: escapeHtml(campaign.preheader ?? ""),
    unsubscribe_url: unsub,
    sender_name: escapeHtml(campaign.fromName),
    sender_address: escapeHtml(senderAddress),
    postal_address: escapeHtml(senderAddress),
    contact_email: escapeHtml(campaign.replyTo || campaign.fromEmail),
    logo_url: `${SITE}/logo.png`,
    year: String(new Date().getFullYear()),
    // The banner block. Blank rather than a leftover {{TOKEN}} when unset.
    eyebrow: escapeHtml(campaign.eyebrow ?? ""),
    headline: escapeHtml(campaign.headline ?? campaign.subject),
    lead_paragraph: escapeHtml(campaign.lead ?? ""),
    primary_url: campaign.primaryUrl ?? unsub,
    primary_label: escapeHtml(campaign.primaryLabel ?? ""),
    footer_note: escapeHtml(campaign.footerNote ?? ""),
  };

  const body = merge(campaign.html, values);
  // MESSAGE_BODY is the slot Will's templates use for the message; content is
  // the platform's own name for the same thing. Both work, so a template
  // written either way drops straight in.
  const html = template
    ? merge(template.html, { ...values, content: body, message_body: body })
    : body;

  return {
    to: contact.email,
    subject: merge(campaign.subject, { ...values, subject: campaign.subject }),
    html,
    headers: {
      // One-click unsubscribe. Gmail and Outlook surface this as a native
      // button, which is both a deliverability signal and the least annoying
      // way for someone to leave.
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export interface SendOutcome {
  sent: number;
  failed: number;
  errors: string[];
}

/**
 * Sends a rendered batch through Resend.
 *
 * Failures are counted and reported rather than thrown: half a campaign
 * delivered is a fact the sender needs to know precisely, not an exception to
 * swallow, and retrying the whole thing would double-send the half that worked.
 */
export async function sendBatch(
  emails: RenderedEmail[],
  from: string,
  replyTo?: string,
): Promise<SendOutcome> {
  if (!KEY) {
    return {
      sent: 0,
      failed: emails.length,
      errors: ["RESEND_API_KEY is not set — nothing was sent."],
    };
  }

  const outcome: SendOutcome = { sent: 0, failed: 0, errors: [] };

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const slice = emails.slice(i, i + BATCH_SIZE);

    try {
      const response = await fetch(`${RESEND_API}/emails/batch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          slice.map((email) => ({
            from,
            to: [email.to],
            subject: email.subject,
            html: email.html,
            headers: email.headers,
            ...(replyTo ? { reply_to: replyTo } : {}),
          })),
        ),
      });

      if (!response.ok) {
        const detail = await response.text();
        outcome.failed += slice.length;
        outcome.errors.push(
          `Batch ${i / BATCH_SIZE + 1}: ${response.status} ${detail.slice(0, 300)}`,
        );
        continue;
      }

      outcome.sent += slice.length;
    } catch (err) {
      outcome.failed += slice.length;
      outcome.errors.push(
        `Batch ${i / BATCH_SIZE + 1}: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
  }

  return outcome;
}

/**
 * Checks a campaign is legal and complete before it goes anywhere.
 *
 * The unsubscribe check is not a nicety: the Spam Act 2003 requires every
 * commercial electronic message sent from Australia to carry a working
 * unsubscribe facility and to identify the sender. A send without one is the
 * kind of mistake that is unrecoverable once it has left, so it's blocked here
 * rather than warned about in the UI.
 */
export function validateCampaign(
  campaign: Campaign,
  template: EmailTemplate | null,
): string | null {
  if (!campaign.subject.trim()) return "The campaign needs a subject line.";
  if (!campaign.html.trim()) return "The campaign has no content.";
  if (!campaign.fromEmail.trim()) return "The campaign needs a from-address.";
  if (!campaign.fromName.trim()) return "The campaign needs a sender name.";

  const combined = `${template?.html ?? ""}${campaign.html}`;
  if (!combined.includes("{{unsubscribe_url}}")) {
    return (
      "No unsubscribe link. Australian law requires every marketing email to " +
      "carry one — add {{unsubscribe_url}} to the campaign or its template."
    );
  }

  return null;
}
