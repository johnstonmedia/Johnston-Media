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

/**
 * A signed link that confirms a subscription.
 *
 * Same trick as the unsubscribe link, for the same reason: no lookup table,
 * nothing to expire, and nobody can forge one by editing a URL. It carries
 * its own purpose in the payload so a confirm signature can never be replayed
 * as an unsubscribe one, or the other way round.
 */
export function confirmUrl(contactId: string, email: string): string {
  const sig = createHmac("sha256", UNSUB_SECRET)
    .update(`confirm:${contactId}:${email.toLowerCase()}`)
    .digest("base64url");
  return `${SITE}/api/email/subscribe?c=${encodeURIComponent(contactId)}&e=${encodeURIComponent(email)}&s=${sig}`;
}

export function verifyConfirm(
  contactId: string,
  email: string,
  sig: string,
): boolean {
  const expected = createHmac("sha256", UNSUB_SECRET)
    .update(`confirm:${contactId}:${email.toLowerCase()}`)
    .digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Turns a typed message into HTML, unless it already is HTML.
 *
 * The campaign body was a raw HTML textarea, so writing a newsletter meant
 * writing <p> tags by hand and remembering that a blank line does nothing.
 * Anything that looks like markup is passed through untouched — someone who
 * wants to hand-write a layout still can — and anything else is treated as
 * what it looks like: paragraphs separated by blank lines.
 */
export function bodyToHtml(text: string): string {
  if (/<(p|div|table|h[1-6]|ul|ol|br|img|a)\b/i.test(text)) return text;

  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px 0">${block
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
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

/**
 * Blanks any {{TOKEN}} the values didn't fill.
 *
 * merge() deliberately leaves an unknown token alone, which is right while
 * you're editing — you want to see that {{SHOOT_DATE}} is unrecognised. It is
 * wrong at the moment of sending: a client opening an email that says
 * "Reference: {{REFERENCE}}" is worse than one that says nothing. So the last
 * step before handing HTML to Resend is to drop whatever is left.
 */
export function stripTokens(source: string): string {
  return source.replace(/\{\{\s*[A-Za-z0-9_]+\s*\}\}/g, "");
}

/**
 * Removes the unsubscribe line from a template.
 *
 * A campaign must carry a working unsubscribe — that is the Spam Act, and
 * validateCampaign refuses to send one without it. Direct correspondence is
 * the opposite case: there is nothing to unsubscribe from, and offering it on
 * a quote or an invoice invites someone to opt out of the mail they actually
 * need. So the link is stripped on the one-to-one path only.
 *
 * Takes the trailing sentence with it ("...from Johnston Media updates.") and
 * any <br> immediately before, so what's left reads as a finished line rather
 * than an orphaned fragment. The sender identification above it stays.
 *
 * Run before merge, while the token is still there to match on.
 */
export function stripUnsubscribe(html: string): string {
  return html.replace(
    /(?:<br\s*\/?>\s*)?<a\b[^>]*\{\{\s*unsubscribe_url\s*\}\}[^>]*>[\s\S]*?<\/a>[^<]*/gi,
    "",
  );
}

/**
 * Removes the table row containing a token, and the token with it.
 *
 * The studio's templates are table-based, so a call-to-action button is one
 * <tr>. Blanking {{PRIMARY_URL}} alone would leave the button drawn with an
 * empty link — a copper pill going nowhere — so the row has to go too.
 *
 * Deliberately simple: it walks back to the nearest opening <tr> and forward
 * to the matching close. Email HTML doesn't nest rows inside a button cell,
 * so there is no ambiguity to resolve.
 */
export function stripRowWith(html: string, token: string): string {
  const needle = new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "i");
  let out = html;

  for (let guard = 0; guard < 10; guard += 1) {
    const hit = out.search(needle);
    if (hit === -1) break;

    const open = out.lastIndexOf("<tr", hit);
    const close = out.indexOf("</tr>", hit);
    if (open === -1 || close === -1) break;

    out = out.slice(0, open) + out.slice(close + "</tr>".length);
  }
  return out;
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

  const body = merge(bodyToHtml(campaign.html), values);
  // MESSAGE_BODY is the slot Will's templates use for the message; content is
  // the platform's own name for the same thing. Both work, so a template
  // written either way drops straight in.
  const html = stripTokens(
    template
      ? merge(template.html, { ...values, content: body, message_body: body })
      : body,
  );

  return {
    to: contact.email,
    subject: stripTokens(
      merge(campaign.subject, { ...values, subject: campaign.subject }),
    ),
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

  // Case-insensitively: the studio's own templates write {{UNSUBSCRIBE_URL}}
  // in caps, and merge() has always been case-insensitive — so a lowercase-
  // only check here refused campaigns whose template carried the link all
  // along, and the error told you to add the thing that was already there.
  const combined = `${template?.html ?? ""}${campaign.html}`;
  if (!/\{\{\s*unsubscribe_url\s*\}\}/i.test(combined)) {
    return (
      "No unsubscribe link. Australian law requires every marketing email to " +
      "carry one — add {{unsubscribe_url}} to the campaign or its template."
    );
  }

  return null;
}
