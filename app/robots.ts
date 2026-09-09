import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

const BASE = SITE_URL;

/** Never worth crawling: auth walls and endpoints that render no content. */
const PRIVATE = ["/portal", "/admin", "/api/"];

/**
 * Crawlers that read the site to answer someone's question, citing a link
 * back. These are what "showing up in AI answers" actually depends on, so
 * they're allowed.
 */
const ANSWER_ENGINES = [
  "OAI-SearchBot", // ChatGPT search results
  "ChatGPT-User", // a person asking ChatGPT to open the page
  "PerplexityBot",
  "Perplexity-User",
  "Claude-User", // a person asking Claude to open the page
  "Claude-SearchBot",
];

/**
 * Crawlers that collect pages as model training data. Distinct from the above:
 * they don't send anyone back to the site.
 *
 * Allowed here, on the reasoning that a small studio gains more from being
 * known to these models than it loses. It is a judgement call, not a technical
 * necessity — move a name into DISALLOWED_TRAINERS below to opt out of one,
 * and the change takes effect on the next deploy.
 */
const TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "meta-externalagent",
];

const DISALLOWED_TRAINERS: string[] = [
  // e.g. "CCBot" — Common Crawl, which is scraped on by everyone downstream.
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },

      // Spelled out rather than left to the wildcard: several of these bots
      // only honour a rule that names them explicitly.
      ...[...ANSWER_ENGINES, ...TRAINING_CRAWLERS].map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: PRIVATE,
      })),

      ...DISALLOWED_TRAINERS.map((userAgent) => ({
        userAgent,
        disallow: "/",
      })),
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
