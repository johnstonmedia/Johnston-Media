/**
 * Service packages — the single source of truth.
 *
 * These drive three things at once:
 *   1. the package cards a client picks from on the public site,
 *   2. what gets recorded on the quote when they do,
 *   3. the line items pre-loaded into the admin invoice builder.
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  SETTING PRICES                                              │
 * │                                                              │
 * │  Prices are in CENTS: $1,200 is 120000.                      │
 * │                                                              │
 * │  `fromCents` is the "from $X" shown publicly on the card.    │
 * │  Leave it undefined and the card reads "Price on request"    │
 * │  instead — which is how every package ships, because these   │
 * │  are Will's rates to set, not ours to invent.                │
 * │                                                              │
 * │  `lineItems` is what lands in the invoice builder when you   │
 * │  invoice a quote for this package. You can still edit every  │
 * │  line before sending, so treat them as a starting point.     │
 * └──────────────────────────────────────────────────────────────┘
 */

export interface PackageLineItem {
  name: string;
  amountCents: number;
  quantity?: number;
}

export interface ServicePackage {
  id: string;
  /** Which quote form this package belongs to. */
  source: "web" | "media";
  name: string;
  /** Who it's for — one short line under the name. */
  audience: string;
  description: string;
  includes: string[];
  /** Indicative starting price in cents. Undefined → "Price on request". */
  fromCents?: number;
  /** Highlights the card and marks it as the recommended option. */
  featured?: boolean;
  /** Pre-loaded into the admin invoice builder. */
  lineItems?: PackageLineItem[];
}

// ============================================================
// Web development
// ============================================================

export const WEB_PACKAGES: ServicePackage[] = [
  {
    id: "web-landing",
    source: "web",
    name: "The Landing Page",
    audience: "One page, one goal",
    description:
      "A single, beautifully built page that converts — ideal for a campaign, a launch or a focused service offering.",
    includes: [
      "Custom single-page design",
      "Contact or booking form with email automation",
      "Mobile-first, fully responsive",
      "Basic SEO and analytics",
      "Live on your own domain",
    ],
    // fromCents: 120000,   ← set to show "from $1,200"
    // lineItems: [{ name: "Landing page — design and build", amountCents: 120000 }],
  },
  {
    id: "web-business",
    source: "web",
    name: "The Business Site",
    audience: "Most small businesses",
    description:
      "A complete multi-page website with everything a growing business needs to be found, trusted and contacted.",
    includes: [
      "Up to 6 custom-designed pages",
      "Portfolio or gallery system",
      "Quote requests wired to your inbox",
      "Square invoicing integration",
      "SEO, analytics and performance tuning",
      "Content you can edit yourself",
    ],
    featured: true,
    // fromCents: 280000,
    // lineItems: [{ name: "Business site — design and build", amountCents: 280000 }],
  },
  {
    id: "web-portal",
    source: "web",
    name: "Custom Portal",
    audience: "When a site isn't enough",
    description:
      "A bespoke web application — client logins, dashboards, file delivery, bookings and payments, built around how you actually work.",
    includes: [
      "Everything in The Business Site",
      "Secure authentication and user roles",
      "Client dashboard and file delivery",
      "Square payments and automated invoicing",
      "Admin panel built for your workflow",
      "Ongoing support and iteration",
    ],
    // Deliberately open-ended — these are always scoped individually.
  },
];

// ============================================================
// Photography, video and aerial
// ============================================================

/**
 * Empty until Will defines his shoot packages.
 *
 * Add entries in the same shape as WEB_PACKAGES with source: "media" and
 * they appear automatically on the contact page — no other code to touch.
 * A starting point, if useful:
 *
 *   Half-day shoot   ·  up to 4 hours, edited gallery
 *   Full-day shoot   ·  up to 8 hours, edited gallery + highlight reel
 *   Season package   ·  multiple fixtures across a season
 *   Aerial add-on    ·  licensed drone coverage alongside any shoot
 */
export const MEDIA_PACKAGES: ServicePackage[] = [];

// ============================================================
// Helpers
// ============================================================

export const ALL_PACKAGES: ServicePackage[] = [
  ...WEB_PACKAGES,
  ...MEDIA_PACKAGES,
];

export function packagesFor(source: "web" | "media"): ServicePackage[] {
  return ALL_PACKAGES.filter((pkg) => pkg.source === source);
}

export function findPackage(id: string | undefined): ServicePackage | undefined {
  if (!id) return undefined;
  return ALL_PACKAGES.find((pkg) => pkg.id === id);
}

/** "from $1,200", or null when no price is set. */
export function formatFromPrice(
  pkg: ServicePackage,
  currency = "AUD",
): string | null {
  if (pkg.fromCents === undefined) return null;
  return `from ${new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(pkg.fromCents / 100)}`;
}
