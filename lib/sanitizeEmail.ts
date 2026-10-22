/**
 * Cleaning inbound email HTML before it is stored.
 *
 * A real email is HTML written by somebody else's mail client, and it has to
 * be shown as they wrote it — a reply that arrives as a signature block with
 * a logo in it should read as that, not as a wall of tags or a flattened
 * line of text. That means rendering a stranger's markup, which means two
 * defences rather than one:
 *
 *   1. this, at the door: the markup is stripped to an allowlist on the way
 *      into the database, so nothing dangerous is ever stored; and
 *   2. the reading pane, which renders it inside a sandboxed iframe with
 *      scripting switched off at the browser level.
 *
 * Either alone would probably do. Both means a gap in one is not a hole.
 *
 * Remote images are kept. Gmail hides them behind a "show images" button
 * because loading one tells the sender you opened the mail; here the mailbox
 * is a two-person business reading mail from people they are already talking
 * to, and a signature with its logo missing looks broken rather than careful.
 */
import "server-only";

import sanitizeHtml from "sanitize-html";

/** Where the content of a mail client's markup actually lives. */
const ALLOWED_TAGS = [
  "a", "abbr", "b", "blockquote", "br", "caption", "center", "code", "col",
  "colgroup", "dd", "div", "dl", "dt", "em", "figcaption", "figure", "font",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "mark", "ol",
  "p", "pre", "q", "s", "section", "small", "span", "strike", "strong", "sub",
  "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
  // Mail is still written in the HTML of 2004: a marketing email without
  // <style> and table attributes falls apart into a single column of text.
  "style",
];

export interface CleanEmailHtml {
  /** Safe to render. Empty when there was nothing worth rendering. */
  html: string;
  /** A plain-text rendering of the same thing, for previews and search. */
  text: string;
}

/**
 * Strips an email's HTML to what can be shown safely.
 *
 * Returns an empty string rather than throwing on anything unparseable: a
 * message that cannot be cleaned is one that gets shown as plain text, not
 * one that takes the webhook down with it.
 */
export function cleanEmailHtml(raw: string | undefined | null): string {
  if (!raw || !raw.trim()) return "";

  try {
    return sanitizeHtml(raw, {
      allowedTags: ALLOWED_TAGS,
      allowedAttributes: {
        a: ["href", "name", "title", "style", "target", "rel"],
        img: ["src", "alt", "title", "width", "height", "style"],
        td: ["colspan", "rowspan", "align", "valign", "width", "height", "style", "bgcolor"],
        th: ["colspan", "rowspan", "align", "valign", "width", "height", "style", "bgcolor"],
        table: ["align", "width", "border", "cellpadding", "cellspacing", "style", "bgcolor"],
        tr: ["align", "valign", "style", "bgcolor"],
        font: ["color", "face", "size"],
        "*": ["style", "class", "dir", "align", "lang"],
      },
      // mailto: and tel: matter in a signature; cid: is how a mail client
      // refers to an image it attached to the message itself.
      allowedSchemes: ["http", "https", "mailto", "tel", "cid"],
      allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
      allowProtocolRelative: true,
      // Dropped entirely, contents and all: an empty <script> is not the
      // worry, what is inside it is.
      nonTextTags: ["script", "textarea", "noscript", "title"],
      // Silences the library's warning about <style>. The warning is about
      // CSS injection, which inside a scriptless sandboxed frame can do no
      // more than the email's own styling already does.
      allowVulnerableTags: true,
      transformTags: {
        // Every link leaves the reading pane rather than replacing it, and
        // carries no reference back to the window it came from.
        a: sanitizeHtml.simpleTransform("a", {
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        }),
      },
    }).trim();
  } catch (err) {
    console.error("[email] could not clean inbound HTML:", err);
    return "";
  }
}

/**
 * A readable plain-text version of an email's HTML.
 *
 * Only used when the provider gave us HTML and no text part — which happens —
 * so that the list preview, the search box and the notification have words in
 * them rather than markup.
 */
export function htmlToText(raw: string | undefined | null): string {
  if (!raw || !raw.trim()) return "";

  try {
    const blocked = sanitizeHtml(raw, {
      allowedTags: [],
      allowedAttributes: {},
      nonTextTags: ["script", "style", "textarea", "noscript", "title", "head"],
    });

    return blocked
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return "";
  }
}
