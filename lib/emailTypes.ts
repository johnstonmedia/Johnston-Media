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
   * The address that is *theirs* — marketing@ for whoever runs campaigns,
   * their own name for someone who corresponds as themselves. It is the one
   * pre-selected when they write, so the common case takes no thought.
   *
   * Always also present in allowedFrom; the panel keeps the two in step so a
   * primary address can never be one they aren't allowed to use.
   */
  primaryFrom?: string;
  /**
   * Mailboxes this person may read.
   *
   * Absent or empty means every mailbox, which is what everyone had before
   * this existed — narrowing by default would have silently locked people out
   * of mail they were already handling. A non-empty list is a restriction:
   * someone who runs campaigns has no reason to read invoice@.
   *
   * Enforced in firestore.rules as well as here. Filtering a list in the
   * browser decides what is shown, not what can be fetched.
   */
  visibleMailboxes?: string[];
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
  /** The body, as HTML. Lands in the template's {{content}}/{{MESSAGE_BODY}}. */
  html: string;

  /**
   * The banner at the top of Will's templates. Optional — a template that
   * doesn't use them simply ignores them.
   */
  eyebrow?: string;
  headline?: string;
  lead?: string;
  /** The one big button. */
  primaryUrl?: string;
  primaryLabel?: string;
  /** The line in the dark card above the footer. */
  footerNote?: string;
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
  description?: string;
  /** Set on the templates installed from the built-in set. */
  seedKey?: string;
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

/**
 * The extra slots the studio's own templates use.
 *
 * The three uploaded templates are built around a shoot: they want a date, a
 * location, a reference number, an amount. None of that is campaign data, so
 * these are only offered on a one-off email, and only for the ones the chosen
 * template actually contains — asking for a shoot date on a template with no
 * place to put it is noise.
 */
export const TEMPLATE_EXTRAS = [
  { key: "projectName", token: "project_name", label: "Project name" },
  { key: "shootDate", token: "shoot_date", label: "Shoot date" },
  { key: "location", token: "location", label: "Location" },
  { key: "reference", token: "reference", label: "Reference" },
  { key: "amount", token: "amount", label: "Amount" },
  { key: "secondaryUrl", token: "secondary_url", label: "Second button link" },
  {
    key: "secondaryLabel",
    token: "secondary_label",
    label: "Second button text",
  },
] as const;

export type TemplateExtraKey = (typeof TEMPLATE_EXTRAS)[number]["key"];

// ─────────────────────────────────────────────────────
// Mailboxes and the inbox
// ─────────────────────────────────────────────────────

/**
 * An address that receives mail.
 *
 * The platform started with one (help@) and immediately wanted more, so a
 * mailbox is a first-class thing rather than a hard-coded string: every
 * incoming message records which address it was sent to, and the inbox groups
 * on that. Adding an address is a row here plus a forwarding rule — no code.
 */
export interface Mailbox {
  /** The address itself, lowercased. Also the document id. */
  address: string;
  /** Shown in the rail: "Help", "Hello", "Accounts". */
  label: string;
  /** One line under the label. */
  description?: string;
  /** Replies from this mailbox go out as this name. */
  fromName?: string;
  /** Ordering in the rail; lower first. */
  order?: number;
  createdAt?: string;
}

/**
 * Mailboxes assumed to exist before anyone has configured any.
 *
 * Without this the inbox would be empty on first run even with mail sitting in
 * it, which reads as broken rather than as unconfigured.
 */
export const DEFAULT_MAILBOXES: Mailbox[] = [
  {
    address: "hello@wjohnstonmedia.com",
    label: "Hello",
    description: "General enquiries",
    fromName: "Johnston Media",
    order: 1,
  },
  {
    address: "help@wjohnstonmedia.com",
    label: "Help",
    description: "Support and questions",
    fromName: "Johnston Media Help",
    order: 2,
  },
  {
    address: "will@wjohnstonmedia.com",
    label: "Will",
    description: "Straight to me",
    fromName: "Will Johnston",
    order: 3,
  },
  {
    address: "quote@wjohnstonmedia.com",
    label: "Quotes",
    description: "Quote requests and estimates",
    fromName: "Johnston Media Quotes",
    order: 4,
  },
  {
    address: "invoice@wjohnstonmedia.com",
    label: "Invoices",
    description: "Invoices, receipts and payment questions",
    fromName: "Johnston Media Accounts",
    order: 5,
  },
  {
    address: "admin@wjohnstonmedia.com",
    label: "Admin",
    description: "Accounts, suppliers, paperwork",
    fromName: "Johnston Media",
    order: 6,
  },
  {
    address: "owner@wjohnstonmedia.com",
    label: "Owner",
    description: "Ownership and business matters",
    fromName: "Will Johnston",
    order: 7,
  },
  {
    // Campaigns go out from here. It still receives, because a marketing
    // address nobody reads is how you miss the one person who replied
    // instead of clicking unsubscribe — and under the Spam Act that reply
    // is a withdrawal of consent you are obliged to honour.
    address: "announcements@wjohnstonmedia.com",
    label: "Announcements",
    description: "Campaign sends and replies to them",
    fromName: "Johnston Media",
    order: 8,
  },
];

/** The pseudo-mailbox meaning "everything, from every address". */
export const ALL_MAILBOXES = "__all__";

// ─────────────────────────────────────────────────────
// Threads
// ─────────────────────────────────────────────────────

export const HELP_STATUSES = ["Open", "Waiting", "Closed"] as const;
export type HelpStatus = (typeof HELP_STATUSES)[number];

export interface HelpThread {
  id: string;
  subject: string;
  /** Who wrote in. */
  fromEmail: string;
  fromName?: string;
  /**
   * Which of your addresses this landed on. Absent on threads recorded before
   * mailboxes existed, which the inbox treats as help@.
   */
  mailbox?: string;
  status: HelpStatus;
  assignedTo?: string;
  /** Preview line for the list. */
  snippet: string;
  messageCount: number;
  unread: boolean;
  /** Flagged by hand, for the things you keep coming back to. */
  starred?: boolean;
  /** Out of the inbox without being resolved. */
  archived?: boolean;
  /**
   * Which directions this conversation has been through.
   *
   * A thread you started by composing has only gone out; one someone wrote to
   * you has only come in; a conversation has both. Folders read these rather
   * than guessing, so Sent and Inbox stop being the same list. Threads
   * recorded before these existed have neither, and are treated as received —
   * which is what they were, since composing didn't exist yet.
   */
  hasInbound?: boolean;
  hasOutbound?: boolean;
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
