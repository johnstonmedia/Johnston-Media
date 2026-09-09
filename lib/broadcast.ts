import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { Campaign, Contact, EmailTemplate } from "./emailTypes";

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

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://wjohnstonmedia.com";

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

  const values: Record<string, string> = {
    name: escapeHtml(contact.name?.trim() || "there"),
    email: escapeHtml(contact.email),
    subject: escapeHtml(campaign.subject),
    unsubscribe_url: unsub,
    sender_name: escapeHtml(campaign.fromName),
    sender_address: escapeHtml(senderAddress),
    year: String(new Date().getFullYear()),
  };

  const body = merge(campaign.html, values);
  const html = template
    ? merge(template.html, { ...values, content: body })
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
