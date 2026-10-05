import { SITE_URL } from "./siteUrl";

/**
 * The shell a blank email goes in.
 *
 * Deliberately almost nothing. A blank email should look like an email
 * somebody typed — the same plain, left-aligned body you'd get out of Gmail —
 * not a marketing layout with a banner on top. The templates exist for when
 * you want that.
 *
 * So: no logo header, no coloured banner, no card on a grey page. Just the
 * message in the house font at a readable size, a rule, and a signature. The
 * only branded thing is the footer, which carries the logo, who sent it, the
 * address a reply reaches, the site, and the postal identification the Spam
 * Act asks of a commercial message.
 *
 * Fonts are the email-safe pairing the templates already use — Georgia for
 * the name, Arial for everything else. Montserrat and Playfair are webfonts;
 * mail clients mostly ignore them, and a font that silently falls back is
 * worse than one chosen on purpose.
 */

const COPPER = "#C15A32";
const NAVY = "#0B2740";
const INK = "#1D2730";
const MUTED = "#66737D";
const RULE = "#E2E5E9";

/** Body text: 15px/1.65 is the size most mail clients render comfortably. */
const BODY_FONT =
  "font-family:Arial, Helvetica, sans-serif; font-size:15px; mso-line-height-rule:exactly; line-height:25px;";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface SignatureDetails {
  /** Who it's from: "Will Johnston", "Johnston Media Help". */
  fromName: string;
  /** The address it goes out as — the one a reply reaches. */
  fromEmail: string;
  /** Sender identification for the footer. */
  senderAddress: string;
}

/**
 * Wraps already-escaped body HTML.
 *
 * The body is inserted as-is, so whatever builds it owns the escaping — the
 * same contract the templates have with {{MESSAGE_BODY}}.
 */
export function plainShell(
  bodyHtml: string,
  subject: string,
  details: SignatureDetails,
): string {
  const name = escapeHtml(details.fromName);
  const email = escapeHtml(details.fromEmail);
  const address = escapeHtml(details.senderAddress);
  const site = SITE_URL.replace(/^https?:\/\//, "");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>${escapeHtml(subject)}</title>
<style>
  body { margin:0; padding:0; background:#FFFFFF; }
  img { border:0; outline:none; text-decoration:none; }
  table { border-collapse:collapse !important; }
  a { color:${COPPER}; }
  @media only screen and (max-width:620px) {
    .jm-wrap { width:100% !important; }
    .jm-pad { padding-left:20px !important; padding-right:20px !important; }
  }
</style></head>
<body style="margin:0; padding:0; background:#FFFFFF;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FFFFFF;">
<tr><td align="left" style="padding:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="left" class="jm-wrap" style="width:600px; max-width:600px; border-collapse:collapse;">

  <tr><td class="jm-pad" style="padding:28px 28px 8px 28px;">
    <div style="${BODY_FONT} color:${INK};">${bodyHtml}</div>
  </td></tr>

  <tr><td class="jm-pad" style="padding:8px 28px 28px 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <tr><td style="padding-top:20px; border-top:1px solid ${RULE};">

        <img src="${SITE_URL}/logo.png" width="150" alt="Johnston Media" style="display:block; width:150px; max-width:60%; height:auto; border:0; margin-bottom:12px;" />

        <p style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:16px; color:${NAVY}; mso-line-height-rule:exactly; line-height:22px;">${name}</p>
        <p style="margin:2px 0 0 0; ${BODY_FONT} font-size:13px; line-height:20px; color:${MUTED};">Johnston Media &nbsp;·&nbsp; Sydney, NSW</p>
        <p style="margin:6px 0 0 0; ${BODY_FONT} font-size:13px; line-height:20px;">
          <a href="mailto:${email}" style="color:${COPPER}; text-decoration:none;">${email}</a>
          &nbsp;·&nbsp;
          <a href="${SITE_URL}" style="color:${COPPER}; text-decoration:none;">${escapeHtml(site)}</a>
        </p>
        <p style="margin:12px 0 0 0; ${BODY_FONT} font-size:11px; line-height:17px; color:#9AA5AE;">${address}</p>

      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
