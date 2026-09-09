/**
 * JSON-LD structured data.
 *
 * Johnston Media is a local service business, so the schema that matters is
 * ProfessionalService (a LocalBusiness subtype) — it's what lets search engines
 * associate the studio with a service area rather than treating the site as a
 * generic web page.
 *
 * Everything here is drawn from real, verifiable details. No invented address,
 * phone number, price range or review count: fabricated schema is worse than
 * none, and Google penalises it.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://wjohnstonmedia.com";
const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "wjohnston.media@gmail.com";

/** Social profiles, included only when actually configured. */
function socialProfiles(): string[] {
  return [
    process.env.NEXT_PUBLIC_INSTAGRAM_URL,
    process.env.NEXT_PUBLIC_TIKTOK_URL,
    process.env.NEXT_PUBLIC_YOUTUBE_URL,
  ].filter((url): url is string => Boolean(url));
}

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Schema is authored here, not user input — no injection surface.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/** Site-wide business identity. Rendered once, in the root layout. */
export function BusinessSchema() {
  const sameAs = socialProfiles();

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "ProfessionalService",
        "@id": `${SITE_URL}/#business`,
        name: "Johnston Media",
        alternateName: "Johnston Media Photography & Videography",
        description:
          "Cinematic photography, videography, aerial media and web development for sports teams, brands and events across New South Wales.",
        slogan: "Your Vision. My Lens.",
        url: SITE_URL,
        logo: `${SITE_URL}/logo.png`,
        image: `${SITE_URL}/logo.png`,
        email: CONTACT_EMAIL,
        founder: {
          "@type": "Person",
          name: "Will Johnston",
        },
        address: {
          "@type": "PostalAddress",
          addressRegion: "NSW",
          addressCountry: "AU",
        },
        areaServed: {
          "@type": "State",
          name: "New South Wales",
        },
        knowsAbout: [
          "Sports photography",
          "Sports videography",
          "Commercial video production",
          "Aerial drone photography",
          "Event coverage",
          "Web development",
        ],
        ...(sameAs.length ? { sameAs } : {}),
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Services",
          itemListElement: [
            "Sports Photography",
            "Sports Videography",
            "Commercial Photography",
            "Commercial Video Production",
            "Aerial & Drone Media",
            "Event Coverage",
            "Video Editing & Post-Production",
            "Web Development",
          ].map((service) => ({
            "@type": "Offer",
            itemOffered: { "@type": "Service", name: service },
          })),
        },
      }}
    />
  );
}

/** Web development offering — rendered on /web-development. */
export function WebDevelopmentSchema() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Service",
        "@id": `${SITE_URL}/web-development#service`,
        name: "Web Development",
        serviceType: "Web design and development",
        description:
          "Custom websites, client portals and booking automation — built on Next.js with Square invoicing and email automation wired in.",
        url: `${SITE_URL}/web-development`,
        provider: { "@id": `${SITE_URL}/#business` },
        areaServed: {
          "@type": "State",
          name: "New South Wales",
        },
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Web development packages",
          itemListElement: [
            {
              name: "The Landing Page",
              description:
                "A single custom-designed page with a contact or booking form and email automation.",
            },
            {
              name: "The Business Site",
              description:
                "A multi-page website with a portfolio system, quote requests and Square invoicing.",
            },
            {
              name: "Custom Portal",
              description:
                "A bespoke web application with authentication, client dashboards, file delivery and payments.",
            },
          ].map((pkg) => ({
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: pkg.name,
              description: pkg.description,
            },
          })),
        },
      }}
    />
  );
}
