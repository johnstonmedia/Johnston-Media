"use client";

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import type { Mailbox } from "@/lib/emailTypes";

import styles from "./email.module.css";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
/** Which mailboxes this device wants, remembered so the UI can show it. */
const STORE = "jm-mail-notify";

/** A user-agent string is unreadable; this pulls out the part people know. */
function deviceName(agent: string): string {
  if (/iPhone/i.test(agent)) return "iPhone";
  if (/iPad/i.test(agent)) return "iPad";
  if (/Android/i.test(agent)) return "Android";
  if (/Macintosh|Mac OS/i.test(agent)) return "Mac";
  if (/Windows/i.test(agent)) return "Windows PC";
  if (/Linux/i.test(agent)) return "Linux";
  return "Unknown device";
}

/**
 * The push API wants raw bytes; VAPID keys travel as base64url.
 *
 * Typed as ArrayBuffer rather than Uint8Array because applicationServerKey
 * will not accept a view whose buffer might be shared.
 */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  // Environment variables pick up stray characters on their way through a
  // paste and a dashboard: wrapping quotes, a trailing newline, the "PUBLIC:"
  // label from the generator. atob() rejects all of them with Safari's
  // "The string did not match the expected pattern", which says nothing about
  // where the bad character came from — so they are stripped here and what
  // is left is checked before it reaches the push API.
  const cleaned = base64.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");

  if (!/^[A-Za-z0-9_-]+$/.test(cleaned)) {
    throw new Error(
      "The VAPID public key has characters that don't belong in it — check " +
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY for stray quotes or spaces.",
    );
  }

  const padded = (cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  let raw: string;
  try {
    raw = atob(padded);
  } catch {
    throw new Error("The VAPID public key isn't valid base64url.");
  }

  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);

  // A P-256 public key is 65 bytes and begins 0x04 (an uncompressed point).
  // Anything else is the wrong key entirely — most often the private half,
  // which is 32 bytes, pasted into the public slot.
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error(
      `That VAPID key decodes to ${bytes.length} bytes, not 65 — it looks ` +
        "like the private key or a truncated copy is in the public slot.",
    );
  }

  return bytes.buffer;
}

/**
 * Turns push notifications on for chosen mailboxes, on this device.
 *
 * Per-device on purpose: your phone can buzz for help@ while the laptop you
 * already stare at all day stays quiet.
 *
 * iOS is the awkward one. Safari will only deliver a push to a site that has
 * been added to the Home Screen — a bookmark is not enough, and the browser
 * gives no hint about why the button did nothing. So the check happens up
 * front and says so, rather than failing silently when permission is asked.
 */
export default function NotifyButton({
  mailboxes,
  getToken,
}: {
  mailboxes: Mailbox[];
  getToken: () => Promise<string | null>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [needsInstall, setNeedsInstall] = useState(false);
  /** What is wrong with the configured VAPID key, if anything. */
  const [keyProblem, setKeyProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [devices, setDevices] = useState<
    { id: string; label: string; mailboxes: string[] }[] | null
  >(null);
  /** This browser's own device id, so its row can be marked. */
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    const hasApi =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    // iOS only exposes PushManager once the site is on the Home Screen, so a
    // missing API on an iPhone means "not installed", not "not supported".
    const iOS = /iP(hone|ad|od)/.test(navigator.userAgent ?? "");
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;

    setSupported(hasApi && Boolean(VAPID_PUBLIC));
    setNeedsInstall(iOS && !standalone);

    // Check the key on open rather than on click. A bad key is a deployment
    // problem, not something the person tapping the checkbox did — telling
    // them the moment the panel opens beats failing after they have chosen.
    if (VAPID_PUBLIC) {
      try {
        urlBase64ToBytes(VAPID_PUBLIC);
        setKeyProblem(null);
      } catch (err) {
        setKeyProblem(err instanceof Error ? err.message : "Unusable key.");
      }
    }

    try {
      const saved = localStorage.getItem(STORE);
      if (saved) setChosen(JSON.parse(saved) as string[]);
    } catch {
      // A device that won't remember the choice still works; it just can't
      // show the current state until the next save.
    }
  }, []);

  const save = useCallback(
    async (next: string[]) => {
      setBusy(true);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast(
            "Notifications are blocked for this site in your browser settings.",
            "error",
          );
          return;
        }

        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        const existing = await registration.pushManager.getSubscription();
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC),
          }));

        const token = await getToken();
        if (!token) {
          toast("Your session expired — sign in again.", "error");
          return;
        }

        const response = await fetch("/api/email/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            subscription: subscription.toJSON(),
            mailboxes: next,
            label: navigator.userAgent.slice(0, 100),
          }),
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
          toast(result.error ?? "Could not save that.", "error");
          return;
        }

        // Nothing chosen means off, and the server deleted the row — so the
        // browser subscription should go too rather than linger unused.
        if (next.length === 0 && existing) {
          await existing.unsubscribe().catch(() => {});
        }

        setChosen(next);
        try {
          localStorage.setItem(STORE, JSON.stringify(next));
        } catch {
          // Not worth failing the save over.
        }
        toast(
          next.length
            ? `This device will buzz for ${next.length} mailbox${next.length === 1 ? "" : "es"}.`
            : "Notifications off on this device.",
        );
      } catch (err) {
        toast(
          err instanceof Error ? err.message : "Could not set that up.",
          "error",
        );
      } finally {
        setBusy(false);
      }
    },
    [getToken, toast],
  );

  /**
   * The id the server files this device under: sha256 of the endpoint, first
   * 40 hex. Computed here so a row can be labelled "this device" without the
   * server handing back endpoints, which are capability URLs.
   */
  const identify = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return;

      const bytes = new TextEncoder().encode(subscription.endpoint);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      setMyId(
        [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .slice(0, 40),
      );
    } catch {
      // Only cosmetic — the list still works without the marker.
    }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const response = await fetch("/api/email/push", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.ok) setDevices(result.devices);
    } catch {
      // A list that won't load shouldn't block subscribing.
    }
  }, [getToken]);

  async function forget(id: string) {
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/email/push?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      // If it was this device, drop the browser subscription too, so saving
      // again mints a fresh one rather than re-registering the dead endpoint.
      if (id === myId) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        await subscription?.unsubscribe().catch(() => {});
        setChosen([]);
        setMyId(null);
      }
      toast("Device removed.");
      void loadDevices();
    } finally {
      setBusy(false);
    }
  }

  /** Proves the push chain end to end, without needing an email to arrive. */
  async function test() {
    setBusy(true);
    setFailure(null);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }
      const response = await fetch("/api/email/push/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setFailure(result.error ?? "The test didn't go through.");
        return;
      }
      toast(
        `Sent to ${result.sent} device${result.sent === 1 ? "" : "s"} — it should appear now.`,
      );
    } catch {
      setFailure("Network error — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Shows a notification straight from the page, with no push service.
   *
   * This is the splitter. "Send a test" exercises the whole chain — server,
   * VAPID, push service, service worker — and when nothing appears there is
   * no way to tell a dead subscription from a browser that simply isn't
   * allowed to show anything. This one skips every network hop: if it shows,
   * permission and the worker are fine and the fault is in the subscription;
   * if it doesn't, nothing else was ever going to work.
   */
  async function showLocal() {
    setBusy(true);
    setFailure(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setFailure(
          `Notifications are "${permission}" for this site. Allow them in the ` +
            "browser's site settings — on a phone, check the OS notification " +
            "settings for the app too.",
        );
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        setFailure(
          "No service worker is registered on this device yet. Tick a mailbox " +
            "and Save first — that's what registers it.",
        );
        return;
      }

      await registration.showNotification("Johnston Media", {
        body: "Local test — the browser can show notifications.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "jm-local",
      });
      toast("Shown. If you can't see it, the block is your OS, not the site.");
    } catch (err) {
      setFailure(
        err instanceof Error ? err.message : "Could not show a notification.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (supported === null) return null;

  return (
    <>
      <button
        type="button"
        className={styles.railItem}
        onClick={() => {
          setOpen(true);
          void loadDevices();
          void identify();
        }}
      >
        <span className={styles.railIcon} aria-hidden="true">
          ◔
        </span>
        <span className={styles.railText}>
          <strong>Notifications</strong>
          <em>{chosen.length ? `${chosen.length} on` : "Off"}</em>
        </span>
      </button>

      {open ? (
        <div
          className="jm-modal-overlay jm-open"
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="jm-modal" style={{ maxWidth: 480 }}>
            <div className="jm-modal-header">
              <h2 className="jm-modal-title">Notify this device</h2>
              <button
                type="button"
                className="jm-modal-close"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {needsInstall ? (
              <div className={styles.warn}>
                <strong>Add this to your Home Screen first.</strong> On iPhone
                and iPad, Safari only delivers notifications to a site that has
                been installed — a bookmark isn&rsquo;t enough. Tap Share, then
                &ldquo;Add to Home Screen&rdquo;, open it from there, and this
                will work.
              </div>
            ) : null}

            {keyProblem ? (
              <div className={styles.warn} role="alert">
                <strong>The push key on the server is wrong.</strong>{" "}
                {keyProblem}
              </div>
            ) : null}

            {!supported && !needsInstall ? (
              <div className={styles.warn}>
                This browser can&rsquo;t do push notifications
                {VAPID_PUBLIC ? "." : ", or the server has no VAPID key set."}
              </div>
            ) : null}

            <p className={styles.rowMeta}>
              Chosen per device, so your phone can buzz for the mailboxes you
              actually want without your laptop doing the same.
            </p>

            {devices && devices.length > 0 ? (
              <div className="jm-field">
                <span className="jm-label">Subscribed devices</span>
                <div className={styles.tickList}>
                  {devices.map((device) => (
                    <div key={device.id} className={styles.tick}>
                      <span>
                        <strong>
                          {device.id === myId ? "This device" : deviceName(device.label)}
                        </strong>
                        <em>
                          {device.mailboxes.length} mailbox
                          {device.mailboxes.length === 1 ? "" : "es"}
                          {device.id === myId ? "" : ` · ${deviceName(device.label)}`}
                        </em>
                      </span>
                      <button
                        type="button"
                        className="jm-btn-ghost jm-btn-sm"
                        style={{ marginLeft: "auto" }}
                        onClick={() => void forget(device.id)}
                        disabled={busy}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <p className={styles.rowMeta} style={{ marginTop: "0.5rem" }}>
                  A push service saying &ldquo;accepted&rdquo; isn&rsquo;t a
                  device showing anything. If one of these is a browser you no
                  longer use, remove it — a dead subscription counts as sent
                  and stays silent.
                </p>
              </div>
            ) : null}

            <div className={styles.tickList}>
              {mailboxes.map((box) => (
                <label key={box.address} className={styles.tick}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(box.address)}
                    disabled={busy || !supported || Boolean(keyProblem)}
                    onChange={(e) =>
                      setChosen(
                        e.target.checked
                          ? [...chosen, box.address]
                          : chosen.filter((a) => a !== box.address),
                      )
                    }
                  />
                  <span>
                    <strong>{box.label}</strong>
                    <em>{box.address}</em>
                  </span>
                </label>
              ))}
            </div>

            {failure ? (
              <div className={styles.warn} role="alert">
                {failure}
              </div>
            ) : null}

            <div
              className={styles.actions}
              style={{ marginTop: "var(--space-lg)" }}
            >
              <button
                type="button"
                className="jm-btn-primary"
                onClick={() => void save(chosen)}
                disabled={busy || !supported || Boolean(keyProblem)}
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="jm-btn-ghost"
                onClick={() => void showLocal()}
                disabled={busy || !supported}
              >
                Show a local one
              </button>
              <button
                type="button"
                className="jm-btn-ghost"
                onClick={() => void test()}
                disabled={busy || !supported || Boolean(keyProblem)}
              >
                Send a test
              </button>
              <button
                type="button"
                className="jm-btn-ghost"
                onClick={() => void save([])}
                disabled={busy || !supported || chosen.length === 0}
              >
                Turn all off
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
