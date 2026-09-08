"use client";

import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

import { getDb, isFirebaseConfigured } from "./firebase";
import type { SiteSettings } from "./types";

/**
 * Reads `settings/site` from Firestore so Will can edit hero copy, the hero
 * video and social links from the admin panel without a redeploy.
 *
 * Progressive enhancement: pages render their static defaults server-side for
 * SEO, then swap in the live values once this resolves.
 */
export function useSiteSettings(enabled = true) {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(getDb(), "settings", "site"));
        if (!cancelled && snap.exists()) {
          setSettings(snap.data() as SiteSettings);
        }
      } catch (err) {
        // Settings are decorative — never block the page on them.
        console.warn("[settings] load failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { settings, loading };
}
