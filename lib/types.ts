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
 * New flow:   Pending → Reviewed → Invoiced → Paid
 * Legacy:     Pending → Sent → Accepted → Approved
 *
 * Both are kept in the union so quotes created by the previous static
 * site still render correctly in the portal and admin panel.
 */
export type QuoteStatus =
  | "Pending"
  | "Reviewed"
  | "Invoiced"
  | "Paid"
  | "Declined"
  | "Sent"
  | "Accepted"
  | "Approved";

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
  currency?: string;
  invoicedAt?: string;
  paidAt?: string;

  createdAt: string;
  updatedAt?: string;
}

export const PROJECT_STAGES = [
  "Planning",
  "Shooting",
  "Editing",
  "Delivering",
  "Delivered",
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export interface ProjectFile {
  name: string;
  url: string;
  uploadedAt: string;
}

export interface Project {
  id: string;
  clientId: string;
  clientName: string;
  serviceType: string;
  name: string;
  status: ProjectStage;
  files?: ProjectFile[];
  quoteId?: string;
  clientNote?: string;
  clientNoteUpdatedAt?: string;
  createdAt: string;
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
  aboutTitle?: string;
  aboutText?: string;
  primaryEmail?: string;
  secondaryEmail?: string;
  igUrl?: string;
  ttUrl?: string;
  ytUrl?: string;
  footerNote?: string;
}

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
