import { SITE_URL } from "./siteUrl";

/**
 * The shell a plain email goes in.
 *
 * "Start blank" shouldn't mean a naked paragraph with no indication of who
 * sent it. A one-off note still comes from a business: it carries the logo,
 * the sender's name, the site and the postal identification — which is also
 * what the Spam Act asks for in a commercial message, template or not.
 *
 * Table-based and inline-styled for the same reason the templates are: mail
 * clients don't reliably support anything else.
 */

const COPPER = "#C15A32";
const NAVY = "#0B2740";
const INK = "#1D2730";
const MUTED = "#66737D";
const PAPER = "#E8E8E8";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface SignatureDetails {
  /** Who it's from, as a person or a desk: "Will Johnston", "Johnston Media Help". */
  fromName: string;
  /** The address it goes out as — the one a reply reaches. */
  fromEmail: string;
  /** Sender identification for the footer. */
  senderAddress: string;
}

/**
 * Wraps already-escaped body HTML in the branded shell.
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
  body { margin:0; padding:0; width:100% !important; background:${PAPER}; }
  img { border:0; outline:none; text-decoration:none; }
  table { border-collapse:collapse !important; }
  a { color:${COPPER}; }
  @media only screen and (max-width:620px) {
    .jm-wrap { width:100% !important; }
    .jm-pad { padding-left:22px !important; padding-right:22px !important; }
  }
</style></head>
<body style="margin:0; padding:0; background:${PAPER};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center" class="jm-wrap" style="width:600px; max-width:600px; margin:0 auto; border-collapse:collapse; background:#FFFFFF;">

  <tr><td align="center" style="padding:26px 32px 20px 32px; background:#FFFFFF;">
    <img src="${SITE_URL}/logo.png" width="220" alt="Johnston Media — Your Vision. My Lens." style="display:block; width:220px; max-width:70%; height:auto; border:0;" />
  </td></tr>
  <tr><td style="height:3px; line-height:3px; font-size:0; background:${COPPER};">&nbsp;</td></tr>

  <tr><td class="jm-pad" style="padding:34px 40px 10px 40px; background:#FFFFFF;">
    <div style="font-family:Arial, Helvetica, sans-serif; font-size:15px; color:${INK}; mso-line-height-rule:exactly; line-height:26px;">${bodyHtml}</div>
  </td></tr>

  <tr><td class="jm-pad" style="padding:18px 40px 32px 40px; background:#FFFFFF;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; border-top:1px solid ${PAPER};">
      <tr><td style="padding-top:18px; font-family:Arial, Helvetica, sans-serif; font-size:14px; color:${INK}; mso-line-height-rule:exactly; line-height:22px;">
        <strong style="color:${NAVY};">${name}</strong><br />
        <span style="color:${MUTED}; font-size:13px;">Johnston Media</span><br />
        <a href="mailto:${email}" style="color:${COPPER}; text-decoration:none; font-size:13px;">${email}</a>
        &nbsp;·&nbsp;
        <a href="${SITE_URL}" style="color:${COPPER}; text-decoration:none; font-size:13px;">${escapeHtml(site)}</a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td class="jm-pad" style="padding:20px 40px 24px 40px; background:${NAVY};">
    <p style="margin:0 0 6px 0; font-family:Georgia,'Times New Roman',serif; font-style:italic; font-size:15px; color:#F2C88D; mso-line-height-rule:exactly; line-height:22px;">Your Vision. My Lens.</p>
    <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#8FA3B4; mso-line-height-rule:exactly; line-height:18px;">${address}</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
