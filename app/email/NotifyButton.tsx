"use client";

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import type { Mailbox } from "@/lib/emailTypes";

import styles from "./email.module.css";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
/** Which mailboxes this device wants, remembered so the UI can show it. */
const STORE = "jm-mail-notify";

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

  if (supported === null) return null;

  return (
    <>
      <button
        type="button"
        className={styles.railItem}
        onClick={() => setOpen(true)}
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

            <div className={styles.tickList}>
              {mailboxes.map((box) => (
                <label key={box.address} className={styles.tick}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(box.address)}
                    disabled={busy || !supported}
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

            <div
              className={styles.actions}
              style={{ marginTop: "var(--space-lg)" }}
            >
              <button
                type="button"
                className="jm-btn-primary"
                onClick={() => void save(chosen)}
                disabled={busy || !supported}
              >
                {busy ? "Saving…" : "Save"}
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
