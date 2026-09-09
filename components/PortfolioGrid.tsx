"use client";

import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";

import { getDb, isFirebaseConfigured } from "@/lib/firebase";
import type { PortfolioProject } from "@/lib/types";

import styles from "./PortfolioGrid.module.css";

interface PortfolioGridProps {
  categorySlug: string;
  label: string;
  /** Cap the number shown (homepage teaser). */
  limit?: number;
}

/** Detects the media type when a project doesn't declare one. */
function isVideo(url?: string, type?: string): boolean {
  if (type) return type === "video";
  if (!url) return false;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

/** Converts a YouTube/Vimeo watch URL into an embeddable one. */
function embedUrl(url: string): string | null {
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  );
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  return null;
}

export default function PortfolioGrid({
  categorySlug,
  label,
  limit,
}: PortfolioGridProps) {
  const [projects, setProjects] = useState<PortfolioProject[] | null>(null);
  const [active, setActive] = useState<PortfolioProject | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setProjects([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const ref = collection(getDb(), "portfolio", categorySlug, "projects");
        const snap = await getDocs(query(ref, orderBy("order", "asc")));
        const items = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as PortfolioProject,
        );
        if (!cancelled) setProjects(items);
      } catch (err) {
        console.warn(`[portfolio] ${categorySlug} load failed:`, err);
        if (!cancelled) setProjects([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [categorySlug]);

  // Escape closes the lightbox; lock scroll while it's open.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);

  const shown = limit ? projects?.slice(0, limit) : projects;

  return (
    <div className={styles.category} id={categorySlug}>
      <h3 className={styles.categoryLabel}>{label}</h3>

      {projects === null ? (
        <div className={styles.grid}>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      ) : shown && shown.length > 0 ? (
        <div className={styles.grid}>
          {shown.map((project) => {
            const cover = project.thumbnail || project.url;
            const video = isVideo(project.url, project.type);

            return (
              <button
                key={project.id}
                type="button"
                className={styles.card}
                onClick={() => setActive(project)}
                aria-label={`View ${project.title}`}
              >
                {cover && !isVideo(cover) ? (
                  // Portfolio media is user-uploaded at arbitrary sizes; a plain
                  // img keeps Firebase Storage URLs working without config churn.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt={project.title}
                    className={styles.media}
                    loading="lazy"
                  />
                ) : cover && isVideo(cover) ? (
                  <video
                    className={styles.media}
                    src={cover}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <div className={styles.placeholder}>JM</div>
                )}

                {video ? <span className={styles.playBadge}>▶</span> : null}

                <span className={styles.overlay}>
                  <span className={styles.cardTitle}>{project.title}</span>
                  {project.description ? (
                    <span className={styles.cardDesc}>
                      {project.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className={styles.empty}>
          New {label.toLowerCase()} work is being added — check back shortly.
        </p>
      )}

      {active ? (
        <div
          className={styles.lbOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
          onClick={(e) => {
            if (e.target === e.currentTarget) setActive(null);
          }}
        >
          <button
            type="button"
            className={styles.lbClose}
            onClick={() => setActive(null)}
            aria-label="Close"
          >
            ×
          </button>

          <div className={styles.lbPanel}>
            <div className={styles.lbHero}>
              {active.url && embedUrl(active.url) ? (
                <iframe
                  src={embedUrl(active.url)!}
                  title={active.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : active.url && isVideo(active.url, active.type) ? (
                <video src={active.url} controls autoPlay playsInline />
              ) : active.url || active.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={active.url || active.thumbnail} alt={active.title} />
              ) : null}
            </div>

            <div className={styles.lbMeta}>
              <div>
                <h2 className={styles.lbTitle}>{active.title}</h2>
                {active.description ? (
                  <p className={styles.lbDesc}>{active.description}</p>
                ) : null}
              </div>
              {active.link ? (
                <a
                  href={active.link}
                  className="jm-btn-ghost jm-btn-sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View project
                </a>
              ) : null}
            </div>

            {active.gallery && active.gallery.length > 0 ? (
              <div className={styles.lbGallery}>
                {active.gallery.map((item, i) => (
                  <div key={i} className={styles.lbThumb}>
                    {isVideo(item.url, item.type) ? (
                      <video src={item.url} muted loop playsInline />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt={`${active.title} — ${i + 1}`}
                        loading="lazy"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
