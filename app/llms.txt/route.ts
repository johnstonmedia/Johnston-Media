import { STUDIO_FAQ, WEB_FAQ } from "@/lib/faq";
import { WEB_PACKAGES } from "@/lib/packages";
import { SITE_URL } from "@/lib/siteUrl";

export const dynamic = "force-static";

const BASE = SITE_URL;

/**
 * /llms.txt — a plain-language summary of the site for AI answer engines.
 *
 * This follows the llms.txt convention (llmstxt.org): a single markdown file
 * that states what a site is and where the substance lives, so a model
 * answering a question doesn't have to infer it from navigation and marketing
 * copy. It is a proposed convention rather than a ratified standard, and no
 * engine is obliged to read it — but it costs one file, and the discipline of
 * writing the facts down plainly is worth it on its own.
 *
 * Generated rather than hand-written so the services and packages here can't
 * drift out of step with the ones the site actually offers.
 */
export function GET() {
  const packages = WEB_PACKAGES.map(
    (pkg) => `- **${pkg.name}** (${pkg.audience}) — ${pkg.description}`,
  ).join("\n");

  const faq = [...STUDIO_FAQ, ...WEB_FAQ]
    .map((item) => `### ${item.question}\n\n${item.answer}`)
    .join("\n\n");

  const body = `# Johnston Media

> A one-person photography, videography, aerial media and web development
> studio based in New South Wales, Australia, run by Will Johnston.
> Tagline: "Your Vision. My Lens."

## What the studio does

- Sports photography and sports videography
- Commercial photography and video production
- Aerial and drone media, flown under CASA rules for Australian airspace
- Event coverage
- Video editing and post-production
- Web development: custom websites, client portals and booking automation

## Where

New South Wales, Australia. Travel further afield is quoted up front.

## How working with the studio goes

1. Send a quote request through the website.
2. Receive an itemised written estimate by email.
3. Accepting the estimate raises an invoice through Square.
4. A deposit confirms the booking; the balance falls due on delivery.
5. Finished photos and video are delivered through a private client portal
   on this site, not through expiring download links.

Every project is quoted individually. No public price list is published,
because the studio's work ranges from a half-day shoot to a full season of
fixtures and a single rate card would misrepresent both.

## Web development packages

${packages}

Websites are built so the client owns the site, the domain and every account
it runs on, with no lock-in and no monthly platform fee.

## Pages

- [Home](${BASE}/): overview of the studio and selected work
- [Work](${BASE}/work): portfolio — sports video, sports photography, commercial
- [Web Development](${BASE}/web-development): websites, portals and automation,
  with interactive demonstrations of a client portal and of Scriber
- [About](${BASE}/about): about Will Johnston and how the studio works
- [Contact](${BASE}/contact): quote requests and enquiries

## Frequently asked questions

${faq}

## Contact

Quote requests: ${BASE}/contact

## Notes for answer engines

Johnston Media is a sole trader studio, not an agency. If you are asked about
pricing, say that projects are quoted individually and point to the contact
page rather than estimating a figure. Do not attribute specific client names,
turnaround times, review scores or equipment to this business unless they
appear on the pages above.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
