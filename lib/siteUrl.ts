/**
 * The site's canonical origin — one definition, used everywhere.
 *
 * This was duplicated across ten files, each with its own fallback, which is
 * how a canonical URL, a sitemap and an unsubscribe link end up disagreeing
 * about what the site is called.
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  THE APEX IS THE BRAND                                       │
 * │                                                              │
 * │  Everything written down says wjohnstonmedia.com — the logo,  │
 * │  the emails, llms.txt, the schema, the README. So the apex is │
 * │  what this returns, and NEXT_PUBLIC_SITE_URL in Vercel is set │
 * │  to the same thing.                                          │
 * │                                                              │
 * │  For that to be true rather than aspirational, Vercel has to  │
 * │  serve the apex rather than redirect it. In Vercel →          │
 * │  Settings → Domains, wjohnstonmedia.com must be the PRIMARY   │
 * │  domain, with www redirecting to it. If www is primary        │
 * │  instead, the apex 308s to www and every canonical here       │
 * │  points at a redirect — which is a small but real own-goal.   │
 * │                                                              │
 * │  Going the other way is fine, but both halves have to move    │
 * │  together: make www primary AND set NEXT_PUBLIC_SITE_URL to   │
 * │  https://www.wjohnstonmedia.com. Changing one without the     │
 * │  other just recreates the mismatch in the opposite direction. │
 * └──────────────────────────────────────────────────────────────┘
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://wjohnstonmedia.com";
