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

let ready = false;
function configure(): boolean {
  if (!isPushConfigured()) return false;
  if (!ready) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
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
