/**
 * Shared domain types for Johnston Media.
 * Mirrors the Firestore collections documented in README.md.
 */

export const ROLES = [
  "Prospective",
  "Client",
  "Admin",
  "Master Admin",
  "Owner",
] as const;

export type Role = (typeof ROLES)[number];

export const ADMIN_ROLES: readonly Role[] = ["Admin", "Master Admin", "Owner"];
export const ELEVATED_ROLES: readonly Role[] = ["Master Admin", "Owner"];

export const OWNER_EMAIL = "wjohnston.media@gmail.com";

export interface UserPermissions {
  editHomepage?: boolean;
  blockDeleteUsers?: boolean;
  manageAdminRoles?: boolean;
  sendInvoices?: boolean;
}

export interface UserProfile {
  id: string;
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  blocked?: boolean;
  adminNotes?: string;
  permissions?: UserPermissions;
  squareCustomerId?: string;
  createdAt: string;
  linkedAt?: string;
}

/**
 * Quote lifecycle.
 *
 *   Pending → Reviewed → Estimate Sent → Accepted → Invoiced
 *           → Deposit Paid → Paid
 *
 * Declined / Cancelled / Refunded can end it at any point, and the estimate
 * step is optional — a quote can go straight to Invoiced.
 *
 * Legacy statuses (Sent, Approved) are kept in the union so quotes created by
 * the previous static site still render in the portal and admin panel.
 */
export type QuoteStatus =
  | "Pending"
  | "Reviewed"
  | "Estimate Sent"
  | "Accepted"
  | "Invoiced"
  | "Deposit Paid"
  | "Paid"
  | "Declined"
  | "Cancelled"
  | "Refunded"
  | "Sent"
  | "Approved";

/** Line item on an estimate. Mirrors the invoice builder's shape. */
export interface EstimateLineItem {
  name: string;
  amountCents: number;
  quantity?: number;
  note?: string;
}

/**
 * An estimate attached to a quote.
 *
 * Square has no public Estimates API — estimates are Dashboard-only — so this
 * lives entirely in our own data. The upside is that acceptance happens in the
 * client portal under Johnston Media branding, and the accepted figures then
 * pre-load the Square invoice rather than being retyped.
 */
export interface Estimate {
  lineItems: EstimateLineItem[];
  /** Sum of line items in cents, stored so history survives price changes. */
  totalCents: number;
  currency: string;
  /** Optional note shown to the client above the breakdown. */
  notes?: string;
  /** ISO date after which the estimate lapses. */
  validUntil?: string;
  sentAt: string;
  sentBy: string;
  acceptedAt?: string;
  declinedAt?: string;
  declineReason?: string;
}

/**
 * Statuses where the client should still be offered a payment link.
 *
 * "Deposit Paid" belongs here: the deposit has landed but the balance is still
 * outstanding on the same Square invoice.
 */
const PAYABLE_STATUSES: readonly QuoteStatus[] = [
  "Invoiced",
  "Sent",
  "Deposit Paid",
];

/**
 * Whether to show a "view & pay" link for a quote.
 *
 * A cancelled or refunded invoice keeps its Square public URL, so the URL alone
 * isn't enough — without this check the portal would go on offering payment on
 * an invoice that was voided months ago.
 */
export function isQuotePayable(quote: {
  status: QuoteStatus;
  squarePublicUrl?: string;
}): boolean {
  return Boolean(quote.squarePublicUrl) && PAYABLE_STATUSES.includes(quote.status);
}

/**
 * Whether the client can still act on an estimate.
 *
 * Only while it's been sent and not yet answered — and not past its expiry,
 * so a stale estimate can't be accepted at last year's prices.
 */
export function isEstimateOpen(quote: {
  status: QuoteStatus;
  estimate?: Estimate;
}): boolean {
  if (quote.status !== "Estimate Sent" || !quote.estimate) return false;
  if (quote.estimate.acceptedAt || quote.estimate.declinedAt) return false;
  if (quote.estimate.validUntil) {
    // Compare dates only — an estimate valid "until the 5th" lasts all of it.
    const expiry = new Date(`${quote.estimate.validUntil}T23:59:59`);
    if (Number.isFinite(expiry.getTime()) && expiry.getTime() < Date.now()) {
      return false;
    }
  }
  return true;
}

/** Which side of the business a quote came from. */
export type QuoteSource = "media" | "web";

export interface Quote {
  id: string;
  clientId: string | null;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  /** Photography/video service, or web package name. */
  serviceType: string;
  source: QuoteSource;
  /** Set when the client chose a pre-made package. */
  packageId?: string;
  /** Present once an estimate has been sent for this quote. */
  estimate?: Estimate;
  /** Project name / short title. */
  name: string;
  date?: string;
  location?: string;
  budget?: string;
  details?: string;
  status: QuoteStatus;

  // ─── Square linkage ───────────────────────────────
  squareCustomerId?: string;
  squareInvoiceId?: string;
  squareInvoiceNumber?: string;
  squarePublicUrl?: string;
  /** Invoice total in the smallest currency unit (cents). */
  amountCents?: number;
  /** Deposit requested up front, in cents. Absent when invoiced in full. */
  depositCents?: number;
  currency?: string;
  /** Raw Square invoice status, mirrored from the webhook for diagnostics. */
  squareInvoiceStatus?: string;
  invoicedAt?: string;
  /** Set when the deposit clears, ahead of the balance. */
  depositPaidAt?: string;
  depositPaidCents?: number;
  paidAt?: string;
  refundedAt?: string;

  createdAt: string;
  updatedAt?: string;
}

/**
 * A document you manage in Square, mirrored here so it shows in the client
 * portal and the admin timeline.
 *
 * Square exposes no API for estimates or contracts — both are Dashboard-only —
 * so these can't be read back automatically. You record the few facts that
 * matter (reference, total, link, dates) once, and the portal can then show the
 * client where things stand instead of leaving a gap in the story.
 */
export interface SquareDocRef {
  /** Reference or number as it appears in Square. */
  reference?: string;
  amountCents?: number;
  currency?: string;
  /** Link to the document — Square's shareable URL, or the Dashboard URL. */
  url?: string;
  /** Free-text state, e.g. "Sent", "Accepted", "Signed". */
  status?: string;
  sentAt?: string;
  /** When it was accepted or signed. */
  resolvedAt?: string;
  note?: string;
  /**
   * Whether the client sees this in their portal. Off by default — nothing
   * reaches the client until you deliberately publish it.
   */
  visibleToClient?: boolean;
  recordedAt: string;
  recordedBy: string;
}

/** The kinds of Square document a project can carry. */
export const SQUARE_DOC_KINDS = ["estimate", "contract"] as const;
export type SquareDocKind = (typeof SQUARE_DOC_KINDS)[number];

/**
 * Mirrors the columns on the Square Projects board, so the site and Square
 * never disagree about where a job sits. Square is where the work happens;
 * this is the same pipeline, reflected for the client.
 */
export const PIPELINE_STAGES = [
  "Enquiry",
  "Proposal",
  "Booked",
  "In progress",
  "Complete",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * Production detail Square doesn't track.
 *
 * "In progress" covers everything from the shoot to final delivery, which is
 * the part a client most wants visibility on — so this sits alongside the
 * pipeline stage rather than replacing it.
 */
export const PRODUCTION_STAGES = [
  "Planning",
  "Shooting",
  "Editing",
  "Delivering",
  "Delivered",
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

/** @deprecated Kept so existing project documents still type-check. */
export const PROJECT_STAGES = PRODUCTION_STAGES;
export type ProjectStage = ProductionStage;

export interface ProjectFile {
  name: string;
  url: string;
  uploadedAt: string;
}

/**
 * A project is the spine of a job.
 *
 * The original request, the estimate, the contract, the invoice, the stage and
 * the delivered files all hang off it, so one record tells the whole story in
 * both the admin panel and the client portal.
 */
export interface Project {
  id: string;
  clientId: string | null;
  clientName: string;
  clientEmail?: string;
  serviceType: string;
  name: string;
  /** Where the job sits on the Square Projects board. */
  pipelineStage?: PipelineStage;
  /** Production detail within "In progress". */
  status: ProductionStage;
  files?: ProjectFile[];
  /** The quote this grew from, when it came in through the site. */
  quoteId?: string;
  clientNote?: string;
  clientNoteUpdatedAt?: string;

  // ─── Square linkage ───────────────────────────────
  squareCustomerId?: string;
  /** Link straight to this job on the Square Projects board. */
  squareProjectUrl?: string;
  /** Estimate managed in Square, recorded here for the timeline. */
  estimateRef?: SquareDocRef;
  /** Contract managed in Square, recorded here for the timeline. */
  contractRef?: SquareDocRef;

  createdAt: string;
  updatedAt?: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface SiteSettings {
  heroTitle?: string;
  heroSubtitle?: string;
  heroEyebrow?: string;
  heroVideoUrl?: string;
  /**
   * "standard" uses the built-in cinematic gradient hero; "custom" plays
   * heroVideoUrl behind it. Falls back to standard when there's no video.
   */
  heroMode?: "standard" | "custom";
  aboutTitle?: string;
  aboutText?: string;
  primaryEmail?: string;
  secondaryEmail?: string;
  igUrl?: string;
  ttUrl?: string;
  ytUrl?: string;
  footerNote?: string;
  updatedAt?: string;
}

/** The fields the content editor writes, in the order they're shown. */
export const SETTINGS_FIELDS = [
  "heroEyebrow",
  "heroTitle",
  "heroSubtitle",
  "heroVideoUrl",
  "aboutTitle",
  "aboutText",
  "primaryEmail",
  "secondaryEmail",
  "igUrl",
  "ttUrl",
  "ytUrl",
  "footerNote",
] as const satisfies readonly (keyof SiteSettings)[];

export interface PortfolioProject {
  id: string;
  title: string;
  description?: string;
  /** Cover image or poster frame. */
  thumbnail?: string;
  /** Primary media URL (video or image). */
  url?: string;
  type?: "video" | "image";
  link?: string;
  gallery?: { url: string; type: "video" | "image" }[];
  order?: number;
}

export const PORTFOLIO_CATEGORIES = [
  { slug: "sports-video", label: "Sports Videography" },
  { slug: "sports-photo", label: "Sports Photography" },
  { slug: "commercial", label: "Commercial" },
] as const;

/** Formats a cents amount for display, e.g. 125000 → "$1,250.00". */
export function formatMoney(cents: number, currency = "AUD"): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
