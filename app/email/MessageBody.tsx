"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./email.module.css";

/**
 * One message's body, shown the way it was written.
 *
 * An email is HTML — a signature with a logo in it, a quoted reply in grey,
 * a table holding a layout together. Rendering that as plain text turns a
 * reply into a flattened paragraph and loses the half of it that was picture,
 * which is what made the inbox read as something other than a mail client.
 *
 * It is rendered in an iframe rather than inline, for three reasons:
 *
 *   1. the email's own CSS stays inside it. Mail is written with <style>
 *      blocks and tag selectors, and `p { color: red }` from a newsletter
 *      would otherwise repaint the whole platform;
 *   2. scripting is off at the browser level. The frame carries no
 *      allow-scripts, so nothing in the message can run even if the cleaning
 *      on the way into the database somehow let it through; and
 *   3. it is the only way to show a sender's layout at its own width without
 *      fighting it.
 *
 * `allow-same-origin` is granted so the height can be measured — without it
 * the frame is opaque and every email is a fixed-height box with its own
 * scrollbar. It is safe here precisely because scripting is not granted:
 * there is nothing inside the frame that can use the origin it is given.
 */

/**
 * The page the email is dropped into.
 *
 * White, like every mail client, because that is what the email was written
 * against: a signature in dark teal on this platform's near-black would be
 * unreadable, and darkening someone else's mail silently changes it.
 */
function documentFor(html: string): string {
  // Mail this platform sent is stored as the whole document it went out as,
  // styles and all. Pasting that inside another body would leave the browser
  // to untangle two documents; it is already a page, so it is used as one.
  if (/^\s*(<!doctype html|<html[\s>])/i.test(html)) {
    return html.replace(
      /<head([^>]*)>/i,
      '<head$1><base target="_blank">',
    );
  }

  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    padding: 16px;
    color: #1d2730;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.6;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  /* A sender's 700px table must not force the reading pane to scroll
     sideways; it reflows instead. */
  img, video { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  blockquote {
    margin: 0 0 0 0.5rem;
    padding-left: 0.85rem;
    border-left: 2px solid #d7dde2;
    color: #5c6a74;
  }
  a { color: #b1552f; }
</style></head>
<body>${html}</body></html>`;
}

export default function MessageBody({
  html,
  text,
}: {
  /** Cleaned on the server. Empty or missing falls back to the text. */
  html?: string;
  text: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  const measure = useCallback(() => {
    const node = frame.current;
    if (!node) return;
    try {
      const doc = node.contentDocument;
      if (!doc?.body) return;
      // scrollHeight of both, because a float or an absolutely positioned
      // element leaves the body shorter than what is actually drawn.
      const next = Math.max(
        doc.body.scrollHeight,
        doc.documentElement?.scrollHeight ?? 0,
      );
      if (next > 0) setHeight(Math.min(next + 8, 4000));
    } catch {
      // Cross-origin, somehow. The fallback height stands.
    }
  }, []);

  useEffect(() => {
    if (!html) return;
    // Images arrive after the load event and change the height when they do,
    // which is exactly the case a signature logo hits.
    const timers = [60, 300, 1200].map((delay) =>
      window.setTimeout(measure, delay),
    );
    window.addEventListener("resize", measure);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("resize", measure);
    };
  }, [html, measure]);

  if (!html) {
    return <div className={styles.mailMsgBody}>{text}</div>;
  }

  return (
    <iframe
      ref={frame}
      className={styles.mailFrame}
      style={{ height: `${height}px` }}
      // No allow-scripts, ever. allow-popups so a link can open in a tab,
      // and allow-popups-to-escape-sandbox so the tab it opens is an ordinary
      // page rather than another sandboxed one.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={documentFor(html)}
      onLoad={measure}
      title="Message"
    />
  );
}
