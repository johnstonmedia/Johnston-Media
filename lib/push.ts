/**
 * Web Push for the email platform (server only).
 *
 * A push subscription is per-device, not per-person: the same account signed
 * in on a phone and a laptop is two rows, and each one chooses which mailboxes
 * it wants to be woken for. That's the right shape — you want your phone to
 * buzz for help@ without your laptop doing it too.
 *
 * Subscriptions expire and get revoked by the browser vendor all the time, so
 * a 404 or 410 from the push service is routine housekeeping rather than an
 * error: the row is deleted and the send carries on.
 */
import "server-only";

import { createECDH } from "node:crypto";

import webpush from "web-push";

import { adminDb } from "./firebaseAdmin";
import { SITE_URL } from "./siteUrl";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT =
  process.env.VAPID_SUBJECT ?? "mailto:wjohnston.media@gmail.com";

export function isPushConfigured(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

/** base64 and base64url both turn up in environment variables. */
function toBase64Url(value: string): string {
  return value
    .trim()
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Whether the configured VAPID keys are actually two halves of one pair.
 *
 * This is the failure that looks like nothing at all: a push service accepts
 * a correctly-signed request for a subscription that was created against a
 * *different* public key, reports success, and delivers to no-one. The server
 * says "sent 1", the device shows nothing, and no log anywhere mentions keys.
 *
 * A P-256 public key is derivable from its private half, so the two can be
 * checked against each other without the private key leaving this process.
 *
 * Returns null when there is nothing to check yet.
 */
export function vapidPairMatches(): boolean | null {
  if (!PUBLIC_KEY || !PRIVATE_KEY) return null;
  try {
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(Buffer.from(PRIVATE_KEY.trim(), "base64url"));
    return (
      curve.getPublicKey().toString("base64url") === toBase64Url(PUBLIC_KEY)
    );
  } catch (err) {
    // An unparseable private key is a mismatch as far as anybody cares.
    console.error("[push] VAPID private key could not be read:", err);
    return false;
  }
}

let ready = false;
function configure(): boolean {
  if (!isPushConfigured()) return false;
  if (!ready) {
    // Said once, loudly, at the only moment anybody will be reading the logs
    // for it. A mismatched pair still sends and still reports success.
    if (vapidPairMatches() === false) {
      console.error(
        "[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not the public half of " +
          "VAPID_PRIVATE_KEY. Pushes will be accepted and delivered to " +
          "nothing. Regenerate the pair and re-subscribe every device.",
      );
    }
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!.trim(), PRIVATE_KEY!.trim());
    ready = true;
  }
  return true;
}

export interface PushDevice {
  /** Hash of the endpoint — the endpoint itself is too long for a doc id. */
  id: string;
  uid: string;
  email: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Which mailboxes this device wants waking for. Empty means none. */
  mailboxes: string[];
  label?: string;
  createdAt: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where clicking it should land. Relative to the platform. */
  url?: string;
  tag?: string;
}

/**
 * Notifies this person's own devices, whatever they're subscribed to.
 *
 * Exists for the test button. Push has a long chain — VAPID keys, a service
 * worker, browser permission, a stored subscription, a reachable push service
 * — and until now the only thing that exercised it was a real inbound email,
 * which needs DNS and a webhook on top. Being able to prove the first half
 * works on its own is the difference between a five-minute fix and a day.
 */
export async function notifyUser(
  uid: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number; devices: number }> {
  if (!configure()) return { sent: 0, removed: 0, devices: 0 };

  const db = adminDb();
  const snap = await db
    .collection("pushSubscriptions")
    .where("uid", "==", uid)
    .get();

  const devices = snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as PushDevice,
  );
  const result = await push(devices, payload);
  return { ...result, devices: devices.length };
}

/**
 * Notifies every device subscribed to this mailbox.
 *
 * Never throws: a notification is a courtesy on top of mail that has already
 * been filed, and a push service having a bad afternoon must not turn a
 * successfully received email into a failed webhook the provider then retries.
 */
export async function notifyMailbox(
  mailbox: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  if (!configure()) return { sent: 0, removed: 0 };

  const db = adminDb();
  let devices: PushDevice[];
  try {
    const snap = await db
      .collection("pushSubscriptions")
      .where("mailboxes", "array-contains", mailbox.toLowerCase())
      .get();
    devices = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PushDevice);
  } catch (err) {
    console.error("[push] could not read subscriptions:", err);
    return { sent: 0, removed: 0 };
  }

  return push(devices, payload);
}

/** The send loop itself, shared by both entry points. */
async function push(
  devices: PushDevice[],
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  const db = adminDb();
  const body = JSON.stringify({
    ...payload,
    url: payload.url ? `${SITE_URL}${payload.url}` : `${SITE_URL}/email`,
  });

  let sent = 0;
  let removed = 0;

  await Promise.all(
    devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: device.endpoint,
            keys: device.keys,
          },
          body,
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 mean the browser threw the subscription away — the phone was
        // reset, the app was removed, permission was revoked. Expected.
        if (status === 404 || status === 410) {
          await db
            .collection("pushSubscriptions")
            .doc(device.id)
            .delete()
            .catch(() => {});
          removed += 1;
        } else {
          console.error(`[push] send failed (${status ?? "?"}):`, err);
        }
      }
    }),
  );

  return { sent, removed };
}
