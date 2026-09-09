import "server-only";

import { adminDb } from "./firebaseAdmin";
import type { SiteSettings } from "./types";

/**
 * How long a page holds its copy of the settings.
 *
 * Short enough that an edit in the admin panel shows up while you're still
 * looking at the site, long enough that the front page isn't hitting Firestore
 * on every request.
 */
export const SETTINGS_REVALIDATE = 60;

/**
 * Reads the editable site content on the server.
 *
 * Server-side on purpose: the words in here are the ones search engines and AI
 * answer engines read, so they have to be in the HTML rather than fetched by
 * the browser afterwards.
 *
 * Returns null rather than throwing when Firebase Admin isn't configured — a
 * missing service account should cost you the custom copy, not the whole page.
 */
export async function getSiteSettings(): Promise<SiteSettings | null> {
  try {
    const snap = await adminDb().collection("settings").doc("site").get();
    return snap.exists ? (snap.data() as SiteSettings) : null;
  } catch (err) {
    console.warn("[settings] server read failed, using built-in copy:", err);
    return null;
  }
}

/** Splits the admin's free text into paragraphs on blank lines. */
export function paragraphs(text: string | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}
