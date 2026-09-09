/**
 * The site's canonical origin — one definition, used everywhere.
 *
 * This was duplicated across ten files, which is how a canonical URL, a
 * sitemap and an unsubscribe link end up disagreeing about what the site is
 * called.
 *
 * The default is the **www** host because that is what production actually
 * serves: Vercel treats www.wjohnstonmedia.com as the primary domain and
 * 308-redirects the apex to it. A canonical URL that points at a redirect is a
 * small but real own-goal, so the code follows reality rather than preference.
 *
 * To make the apex primary instead: in Vercel → Settings → Domains, set
 * wjohnstonmedia.com as primary, then set NEXT_PUBLIC_SITE_URL to
 * https://wjohnstonmedia.com. Both halves matter — changing one without the
 * other recreates the mismatch in the opposite direction.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.wjohnstonmedia.com";
