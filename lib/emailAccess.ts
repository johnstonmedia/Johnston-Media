import "server-only";

import { adminDb, getCaller } from "./firebaseAdmin";
import {
  atLeast,
  DEFAULT_MAX_RECIPIENTS,
  type EmailAccess,
  type EmailLevel,
} from "./emailTypes";
import { ADMIN_ROLES, type Role } from "./types";

export interface EmailCaller {
  uid: string;
  email: string;
  role: Role;
  access: EmailAccess;
}

/**
 * Resolves what the caller may do in the email platform.
 *
 * Site admins are granted full email access implicitly — they can already
 * grant themselves the record, so making them click through it would be
 * ceremony rather than security. Everyone else gets exactly what their
 * emailAccess document says, and the absence of a document is "none".
 */
export async function getEmailCaller(
  request: Request,
): Promise<EmailCaller | null> {
  const caller = await getCaller(request);
  if (!caller) return null;

  if (ADMIN_ROLES.includes(caller.role)) {
    return {
      uid: caller.uid,
      email: caller.email,
      role: caller.role,
      access: {
        uid: caller.uid,
        email: caller.email,
        level: "admin",
        allowedFrom: [],
        canBroadcast: true,
        updatedAt: "",
        updatedBy: "site-admin",
      },
    };
  }

  const snap = await adminDb().collection("emailAccess").doc(caller.uid).get();
  if (!snap.exists) return null;

  const access = { uid: snap.id, ...snap.data() } as EmailAccess;
  if (access.level === "none") return null;

  return {
    uid: caller.uid,
    email: caller.email,
    role: caller.role,
    access,
  };
}

/** Caller, or null when they don't clear `required`. */
export async function requireEmailLevel(
  request: Request,
  required: EmailLevel,
): Promise<EmailCaller | null> {
  const caller = await getEmailCaller(request);
  if (!caller) return null;
  return atLeast(caller.access.level, required) ? caller : null;
}

/**
 * Whether this caller may send as this address.
 *
 * An empty allow-list means no addresses, never all of them — the failure mode
 * of the opposite convention is somebody sending as the owner.
 */
export function canSendAs(caller: EmailCaller, from: string): boolean {
  if (caller.access.level === "admin") return true;
  const wanted = from.trim().toLowerCase();
  return caller.access.allowedFrom.some(
    (allowed) => allowed.trim().toLowerCase() === wanted,
  );
}

/**
 * Whether this caller may read a given mailbox.
 *
 * Three rules, in order:
 *   its owner always can, whatever else is set;
 *   a personal mailbox needs seesPersonalMail, admin or not;
 *   otherwise an empty visibleMailboxes means all of them.
 *
 * The middle rule is the point: "runs the mail platform" and "may read the
 * owner's correspondence" are different permissions, and the common case — a
 * manager who does neither of the other two — should be the default rather
 * than something an admin has to remember to switch off.
 */
export function canReadMailbox(
  caller: EmailCaller,
  mailbox: { address: string; personal?: boolean; ownerUid?: string },
): boolean {
  if (mailbox.ownerUid && mailbox.ownerUid === caller.uid) return true;

  if (mailbox.personal && !caller.access.seesPersonalMail) return false;

  const allowed = caller.access.visibleMailboxes ?? [];
  if (caller.access.level === "admin" || allowed.length === 0) return true;
  return allowed.includes(mailbox.address.toLowerCase());
}

/** The most recipients this caller may reach in one send. */
export function recipientCeiling(caller: EmailCaller): number {
  if (caller.access.level === "admin") return Number.POSITIVE_INFINITY;
  return caller.access.maxRecipients ?? DEFAULT_MAX_RECIPIENTS;
}
