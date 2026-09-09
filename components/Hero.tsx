"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useSiteSettings } from "@/lib/useSiteSettings";

import styles from "./Hero.module.css";

interface HeroProps {
  eyebrow: string;
  /** Rendered as the h1. Use <em> for the italic amber second line. */
  title: ReactNode;
  sub?: string;
  lead?: string;
  actions?: ReactNode;
  /** Show the animated scroll cue (homepage only). */
  showScroll?: boolean;
  /** Shorter hero for interior pages. */
  compact?: boolean;
  /**
   * Pull heroVideoUrl from Firestore settings/site and play it behind the hero.
   * Falls back to the gradient when unset or when the video can't load.
   */
  useSettingsVideo?: boolean;
}

export default function Hero({
  eyebrow,
  title,
  sub,
  lead,
  actions,
  showScroll = false,
  compact = false,
  useSettingsVideo = false,
}: HeroProps) {
  const { settings } = useSiteSettings(useSettingsVideo);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  const videoUrl = useSettingsVideo ? settings?.heroVideoUrl : undefined;

  // Parallax drift on the background while the hero is in view.
  const bgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const el = bgRef.current;
      if (!el) return;
      const offset = Math.min(window.scrollY, window.innerHeight) * 0.28;
      el.style.transform = `translate3d(0, ${offset}px, 0)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // iOS Safari needs an explicit play() call after the source is attached.
  useEffect(() => {
    if (!videoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => setVideoReady(false));
  }, [videoUrl]);

  return (
    <section
      className={`${styles.hero} ${compact ? styles.heroCompact : ""}`}
    >
      <div ref={bgRef} className={styles.bg} aria-hidden="true" />

      {videoUrl ? (
        <video
          ref={videoRef}
          className={styles.video}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoReady(false)}
          style={{ opacity: videoReady ? 1 : 0, transition: "opacity 1s ease" }}
          aria-hidden="true"
        />
      ) : null}

      <div className={styles.dim} aria-hidden="true" />
      <div className={`jm-flare ${styles.flareTop}`} aria-hidden="true" />
      <div className={`jm-flare ${styles.flareBottom}`} aria-hidden="true" />
      <div className="jm-grain" aria-hidden="true" />

      <div className={styles.content}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1 className={styles.title}>{title}</h1>
        {sub ? <p className={styles.sub}>{sub}</p> : null}
        {lead ? <p className={styles.lead}>{lead}</p> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>

      {showScroll ? (
        <Link href="#work" className={styles.scroll} aria-label="Scroll to work">
          <span>Scroll</span>
          <span className={styles.scrollLine} />
        </Link>
      ) : null}
    </section>
  );
}
