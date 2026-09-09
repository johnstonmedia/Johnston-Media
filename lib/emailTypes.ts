/**
 * The email platform — types and access model.
 *
 * It runs on the same user base as the rest of the site (one Firebase Auth
 * account per person) but carries its own permission level, because "can see
 * their own invoices in the portal" and "can email four thousand people" are
 * not the same trust.
 */

/**
 * What someone may do in the email platform.
 *
 * Deliberately a ladder rather than a set of independent switches: every level
 * strictly contains the one below, so there is no combination to reason about
 * when you're deciding whether an action is allowed.
 */
export const EMAIL_LEVELS = ["none", "read", "draft", "send", "admin"] as const;
export type EmailLevel = (typeof EMAIL_LEVELS)[number];

export const EMAIL_LEVEL_LABELS: Record<EmailLevel, string> = {
  none: "No access",
  read: "Read only",
  draft: "Write drafts",
  send: "Write and send",
  admin: "Full control",
};

export const EMAIL_LEVEL_HINTS: Record<EmailLevel, string> = {
  none: "Can't open the email platform at all.",
  read: "Can see campaigns, contacts and the help inbox. Cannot change or send anything.",
  draft: "Can write and edit campaigns, and reply in the help inbox. Cannot send a campaign.",
  send: "Can send campaigns, but only from the addresses listed below.",
  admin: "Everything, including granting access to other people.",
};

const RANK: Record<EmailLevel, number> = {
  none: 0,
  read: 1,
  draft: 2,
  send: 3,
  admin: 4,
};

/** True when `level` is at least `required`. */
export function atLeast(level: EmailLevel, required: EmailLevel): boolean {
  return RANK[level] >= RANK[required];
}

export interface EmailAccess {
  /** Firebase uid — the document id. */
  uid: string;
  email: string;
  name?: string;
  level: EmailLevel;
  /**
   * From-addresses this person may send as. Empty means "none allowed", not
   * "all allowed" — an empty allow-list must never mean unrestricted.
   * Ignored for level "admin", which may use any verified address.
   */
  allowedFrom: string[];
  /**
   * Marketing sends can go to thousands of people at once, so it's gated
   * separately from transactional sending even at level "send".
   */
  canBroadcast: boolean;
  /** Per-send recipient ceiling. Undefined means the platform default. */
  maxRecipients?: number;
  updatedAt: string;
  updatedBy: string;
}

export const DEFAULT_ACCESS: Omit<EmailAccess, "uid" | "email"> = {
  level: "none",
  allowedFrom: [],
  canBroadcast: false,
  updatedAt: "",
  updatedBy: "",
};

/** Safety net when nobody has set a per-person ceiling. */
export const DEFAULT_MAX_RECIPIENTS = 500;

// ─────────────────────────────────────────────────────
// Contacts and audiences
// ─────────────────────────────────────────────────────

export interface Contact {
  id: string;
  email: string;
  name?: string;
  /** Free-form labels, used to build audiences. */
  tags: string[];
  /**
   * False the moment someone unsubscribes. Never delete the record — the
   * Spam Act requires you to honour it, which means remembering it.
   */
  subscribed: boolean;
  unsubscribedAt?: string;
  /** Where they came from: "quote form", "import", "added by hand". */
  source?: string;
  /** Set when a send hard-bounces, so they're skipped next time. */
  bounced?: boolean;
  createdAt: string;
}

export interface Audience {
  id: string;
  name: string;
  description?: string;
  /**
   * A contact is in this audience when it carries every tag listed here.
   * Empty means everyone who is still subscribed.
   */
  tags: string[];
  createdAt: string;
  createdBy: string;
}

// ─────────────────────────────────────────────────────
// Campaigns
// ─────────────────────────────────────────────────────

export const CAMPAIGN_STATUSES = [
  "Draft",
  "Scheduled",
  "Sending",
  "Sent",
  "Failed",
  "Cancelled",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  /** The grey line after the subject in most inboxes. */
  preheader?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  /** Which saved template wraps the body. */
  templateId?: string;
  /** The body, as HTML. */
  html: string;
  audienceId?: string;
  status: CampaignStatus;
  scheduledFor?: string;
  stats?: {
    recipients: number;
    sent: number;
    failed: number;
    skipped: number;
  };
  lastError?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  sentAt?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  /**
   * Full HTML document. `{{content}}` is replaced with the campaign body, and
   * the merge fields below are substituted per recipient.
   */
  html: string;
  isDefault?: boolean;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Merge fields available in a template or campaign body.
 *
 * {{unsubscribe_url}} is not optional — Australian law requires a working
 * unsubscribe in every commercial message, so a send is refused without it.
 */
export const MERGE_FIELDS = [
  { token: "{{name}}", describes: "The contact's name, or “there” if unknown" },
  { token: "{{email}}", describes: "The contact's email address" },
  { token: "{{content}}", describes: "The campaign body (templates only)" },
  { token: "{{subject}}", describes: "The campaign subject line" },
  { token: "{{unsubscribe_url}}", describes: "One-click unsubscribe — required" },
  { token: "{{sender_name}}", describes: "Your business name" },
  { token: "{{sender_address}}", describes: "Your postal or business address" },
  { token: "{{year}}", describes: "The current year" },
] as const;

// ─────────────────────────────────────────────────────
// Help inbox
// ─────────────────────────────────────────────────────

export const HELP_STATUSES = ["Open", "Waiting", "Closed"] as const;
export type HelpStatus = (typeof HELP_STATUSES)[number];

export interface HelpThread {
  id: string;
  subject: string;
  /** Who wrote in. */
  fromEmail: string;
  fromName?: string;
  status: HelpStatus;
  assignedTo?: string;
  /** Preview line for the list. */
  snippet: string;
  messageCount: number;
  unread: boolean;
  createdAt: string;
  lastMessageAt: string;
}

export interface HelpMessage {
  id: string;
  /** "in" is from the person who wrote; "out" is a reply from the team. */
  direction: "in" | "out";
  fromEmail: string;
  fromName?: string;
  body: string;
  /** Set on replies — who sent it. */
  authorEmail?: string;
  createdAt: string;
}

/** "Jane Doe <jane@example.com>" */
export function formatAddress(name: string | undefined, email: string): string {
  return name?.trim() ? `${name.trim()} <${email}>` : email;
}
