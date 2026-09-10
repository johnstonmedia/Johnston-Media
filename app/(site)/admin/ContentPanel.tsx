"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref as storageRef, getDownloadURL, uploadBytes } from "firebase/storage";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb, getFirebaseStorage } from "@/lib/firebase";
import type { SiteSettings } from "@/lib/types";

import styles from "./admin.module.css";

/**
 * Edits the words and images on the public site.
 *
 * Everything here lands in settings/site, which the public pages read at
 * runtime — so a change is live as soon as it's saved, with no rebuild and
 * nothing for anyone else to deploy.
 */
export default function ContentPanel() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const snap = await getDoc(doc(getDb(), "settings", "site"));
      setSettings(snap.exists() ? (snap.data() as SiteSettings) : {});
    } catch (err) {
      console.error("[admin] settings failed:", err);
      setSettings({});
      toast("Could not load site content.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings((prev) => ({ ...(prev ?? {}), [key]: value }));
  }

  async function save() {
    if (!settings || saving) return;
    setSaving(true);
    try {
      // Custom hero with no video would render an empty black band — fall back.
      const heroMode =
        settings.heroMode === "custom" && !settings.heroVideoUrl?.trim()
          ? "standard"
          : (settings.heroMode ?? "standard");

      const payload: SiteSettings = {
        ...settings,
        heroMode,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(getDb(), "settings", "site"), payload, { merge: true });
      setSettings(payload);
      toast(
        heroMode !== settings.heroMode
          ? "Saved — no hero video, so it's back on the standard hero."
          : "Saved — the site is updated.",
      );
    } catch (err) {
      console.error("[admin] settings save failed:", err);
      toast("Save failed — check your connection and try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadHeroVideo(file: File) {
    setUploading(true);
    try {
      const path = `site/hero/${Date.now()}_${file.name}`;
      const snap = await uploadBytes(storageRef(getFirebaseStorage(), path), file);
      const url = await getDownloadURL(snap.ref);
      set("heroVideoUrl", url);
      set("heroMode", "custom");
      toast("Video uploaded — press Save to put it live.");
    } catch (err) {
      console.error("[admin] hero upload failed:", err);
      toast("Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  }

  if (!settings) {
    return (
      <section>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Site content</h2>
        </div>
        <p className={styles.empty}>Loading…</p>
      </section>
    );
  }

  const mode = settings.heroMode ?? "standard";

  return (
    <section>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Site content</h2>
      </div>

      <p className={styles.panelIntro}>
        Everything here is live on the public site the moment you save. Leave a
        field empty to keep the built-in wording.
      </p>

      {/* ── Hero ─────────────────────────────── */}
      <h3 className={styles.groupLabel}>Home page hero</h3>

      <div className={styles.fieldRow}>
        <div className="jm-field">
          <label className="jm-label" htmlFor="c-heroEyebrow">
            Eyebrow
          </label>
          <input
            id="c-heroEyebrow"
            className="jm-input"
            value={settings.heroEyebrow ?? ""}
            placeholder="Sydney · NSW · Australia"
            onChange={(e) => set("heroEyebrow", e.target.value)}
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="c-heroTitle">
            Headline
          </label>
          <input
            id="c-heroTitle"
            className="jm-input"
            value={settings.heroTitle ?? ""}
            placeholder="Your Vision. My Lens."
            onChange={(e) => set("heroTitle", e.target.value)}
          />
        </div>
      </div>

      <div className="jm-field">
        <label className="jm-label" htmlFor="c-heroSubtitle">
          Sub-heading
        </label>
        <textarea
          id="c-heroSubtitle"
          className="jm-textarea"
          rows={2}
          value={settings.heroSubtitle ?? ""}
          placeholder="Cinematic photography, videography and aerial media across New South Wales."
          onChange={(e) => set("heroSubtitle", e.target.value)}
        />
      </div>

      <div className={styles.modeRow}>
        <label className={styles.depositToggle}>
          <input
            type="radio"
            name="heroMode"
            checked={mode === "standard"}
            onChange={() => set("heroMode", "standard")}
          />
          <span>
            Standard hero
            <em>The cinematic gradient. Fast, and always looks right.</em>
          </span>
        </label>

        <label className={styles.depositToggle}>
          <input
            type="radio"
            name="heroMode"
            checked={mode === "custom"}
            onChange={() => set("heroMode", "custom")}
          />
          <span>
            Video hero
            <em>Plays your own showreel behind the headline.</em>
          </span>
        </label>
      </div>

      <div className="jm-field">
        <label className="jm-label" htmlFor="c-heroVideo">
          Hero video
        </label>
        <input
          id="c-heroVideo"
          className="jm-input"
          value={settings.heroVideoUrl ?? ""}
          placeholder="Paste a video URL, or upload one below"
          onChange={(e) => set("heroVideoUrl", e.target.value)}
        />
        <div className={styles.uploadRow}>
          <input
            type="file"
            accept="video/*"
            className={styles.fileInput}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadHeroVideo(file);
              e.target.value = "";
            }}
          />
          {uploading ? <span className={styles.uploadNote}>Uploading…</span> : null}
        </div>
      </div>

      {/* ── About ────────────────────────────── */}
      <h3 className={styles.groupLabel}>About</h3>

      <div className="jm-field">
        <label className="jm-label" htmlFor="c-aboutTitle">
          Pull quote
        </label>
        <input
          id="c-aboutTitle"
          className="jm-input"
          value={settings.aboutTitle ?? ""}
          placeholder="Every frame is a decision."
          onChange={(e) => set("aboutTitle", e.target.value)}
        />
      </div>

      <div className="jm-field">
        <label className="jm-label" htmlFor="c-aboutText">
          Your story
        </label>
        <textarea
          id="c-aboutText"
          className="jm-textarea"
          rows={6}
          value={settings.aboutText ?? ""}
          placeholder="Write it the way you'd say it out loud. Blank lines start a new paragraph."
          onChange={(e) => set("aboutText", e.target.value)}
        />
      </div>

      {/* ── Contact ──────────────────────────── */}
      <h3 className={styles.groupLabel}>Contact and socials</h3>

      <div className={styles.fieldRow}>
        <div className="jm-field">
          <label className="jm-label" htmlFor="c-primaryEmail">
            Public email
          </label>
          <input
            id="c-primaryEmail"
            className="jm-input"
            type="email"
            value={settings.primaryEmail ?? ""}
            onChange={(e) => set("primaryEmail", e.target.value)}
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="c-secondaryEmail">
            Second email (optional)
          </label>
          <input
            id="c-secondaryEmail"
            className="jm-input"
            type="email"
            value={settings.secondaryEmail ?? ""}
            onChange={(e) => set("secondaryEmail", e.target.value)}
          />
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className="jm-field">
          <label className="jm-label" htmlFor="c-ig">
            Instagram
          </label>
          <input
            id="c-ig"
            className="jm-input"
            type="url"
            value={settings.igUrl ?? ""}
            placeholder="https://instagram.com/…"
            onChange={(e) => set("igUrl", e.target.value)}
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="c-tt">
            TikTok
          </label>
          <input
            id="c-tt"
            className="jm-input"
            type="url"
            value={settings.ttUrl ?? ""}
            placeholder="https://tiktok.com/@…"
            onChange={(e) => set("ttUrl", e.target.value)}
          />
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className="jm-field">
          <label className="jm-label" htmlFor="c-yt">
            YouTube
          </label>
          <input
            id="c-yt"
            className="jm-input"
            type="url"
            value={settings.ytUrl ?? ""}
            placeholder="https://youtube.com/@…"
            onChange={(e) => set("ytUrl", e.target.value)}
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="c-footer">
            Footer line
          </label>
          <input
            id="c-footer"
            className="jm-input"
            value={settings.footerNote ?? ""}
            placeholder="ABN 12 345 678 901"
            onChange={(e) => set("footerNote", e.target.value)}
          />
        </div>
      </div>

      <div className={styles.saveBar}>
        <button
          type="button"
          className="jm-btn-primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save content"}
        </button>
        {settings.updatedAt ? (
          <span className={styles.uploadNote}>
            Last saved{" "}
            {new Date(settings.updatedAt).toLocaleString("en-AU", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        ) : null}
      </div>
    </section>
  );
}
