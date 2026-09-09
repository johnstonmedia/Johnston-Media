"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { ref as storageRef, getDownloadURL, uploadBytes } from "firebase/storage";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb, getFirebaseStorage } from "@/lib/firebase";
import { PORTFOLIO_CATEGORIES, type PortfolioProject } from "@/lib/types";

import styles from "./admin.module.css";

/** Videos are detected by extension when a URL is pasted rather than uploaded. */
const VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i;

/**
 * Adds, edits, reorders and removes the work shown on the public site.
 *
 * Writes to portfolio/{category}/projects — the same path the public grid
 * reads — so anything saved here appears on /work and the home page straight
 * away.
 */
export default function PortfolioPanel() {
  const { toast } = useToast();
  const [category, setCategory] = useState<string>(
    PORTFOLIO_CATEGORIES[0].slug,
  );
  const [projects, setProjects] = useState<PortfolioProject[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PortfolioProject | null>(null);

  // New-project form.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [url, setUrl] = useState("");

  const load = useCallback(async () => {
    setProjects(null);
    try {
      const ref = collection(getDb(), "portfolio", category, "projects");
      const snap = await getDocs(query(ref, orderBy("order", "asc")));
      setProjects(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PortfolioProject),
      );
    } catch (err) {
      console.error("[admin] portfolio failed:", err);
      setProjects([]);
      toast("Could not load this category.", "error");
    }
  }, [category, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File): Promise<string> {
    const path = `portfolio/${category}/${Date.now()}_${file.name}`;
    const snap = await uploadBytes(storageRef(getFirebaseStorage(), path), file);
    return getDownloadURL(snap.ref);
  }

  async function addProject(file?: File) {
    if (busy) return;
    if (!title.trim()) {
      toast("Give the project a title.", "error");
      return;
    }
    if (!file && !url.trim()) {
      toast("Add an image or video — either upload one or paste a URL.", "error");
      return;
    }

    setBusy(true);
    try {
      let mediaUrl = url.trim();
      let type: "video" | "image" = VIDEO_RE.test(mediaUrl) ? "video" : "image";

      if (file) {
        toast("Uploading…");
        mediaUrl = await upload(file);
        type = file.type.startsWith("video") ? "video" : "image";
      }

      await addDoc(collection(getDb(), "portfolio", category, "projects"), {
        title: title.trim(),
        description: description.trim(),
        link: link.trim(),
        url: mediaUrl,
        thumbnail: type === "image" ? mediaUrl : "",
        type,
        gallery: [],
        // Newest last by default; the arrows below reorder from here.
        order: Date.now(),
        createdAt: new Date().toISOString(),
      });

      setTitle("");
      setDescription("");
      setLink("");
      setUrl("");
      toast(`“${title.trim()}” added.`);
      void load();
    } catch (err) {
      console.error("[admin] add project failed:", err);
      toast("Could not add that project.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await updateDoc(
        doc(getDb(), "portfolio", category, "projects", editing.id),
        {
          title: editing.title,
          description: editing.description ?? "",
          link: editing.link ?? "",
          url: editing.url ?? "",
        },
      );
      setProjects(
        (prev) =>
          prev?.map((p) => (p.id === editing.id ? editing : p)) ?? null,
      );
      setEditing(null);
      toast("Project updated.");
    } catch (err) {
      console.error("[admin] edit failed:", err);
      toast("Could not save that change.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(project: PortfolioProject) {
    if (
      !window.confirm(
        `Remove “${project.title}” from the site? This can't be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteDoc(
        doc(getDb(), "portfolio", category, "projects", project.id),
      );
      setProjects((prev) => prev?.filter((p) => p.id !== project.id) ?? null);
      toast("Removed.");
    } catch (err) {
      console.error("[admin] delete failed:", err);
      toast("Could not remove that project.", "error");
    }
  }

  /** Swaps this project's order with its neighbour's, so the grid reorders. */
  async function move(index: number, direction: -1 | 1) {
    if (!projects) return;
    const target = index + direction;
    if (target < 0 || target >= projects.length) return;

    const a = projects[index];
    const b = projects[target];
    const orderA = a.order ?? index;
    const orderB = b.order ?? target;

    const next = [...projects];
    next[index] = { ...b, order: orderA };
    next[target] = { ...a, order: orderB };
    next.sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    setProjects(next);

    try {
      const base = collection(getDb(), "portfolio", category, "projects");
      await Promise.all([
        updateDoc(doc(base, a.id), { order: orderB }),
        updateDoc(doc(base, b.id), { order: orderA }),
      ]);
    } catch (err) {
      console.error("[admin] reorder failed:", err);
      toast("Could not save the new order.", "error");
      void load();
    }
  }

  return (
    <section>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Portfolio</h2>
        <div className={styles.filters}>
          {PORTFOLIO_CATEGORIES.map((item) => (
            <button
              key={item.slug}
              type="button"
              className={`${styles.filter} ${
                category === item.slug ? styles.filterActive : ""
              }`}
              onClick={() => setCategory(item.slug)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.panelIntro}>
        These appear on the home page and <strong>/work</strong>, in the order
        below.
      </p>

      {/* ── Add ──────────────────────────────── */}
      <div className={styles.addCard}>
        <h3 className={styles.groupLabel} style={{ marginTop: 0 }}>
          Add to {PORTFOLIO_CATEGORIES.find((c) => c.slug === category)?.label}
        </h3>

        <div className={styles.fieldRow}>
          <div className="jm-field">
            <label className="jm-label" htmlFor="p-title">
              Title
            </label>
            <input
              id="p-title"
              className="jm-input"
              value={title}
              placeholder="Round 12 vs Newcastle"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="jm-field">
            <label className="jm-label" htmlFor="p-link">
              Link (optional)
            </label>
            <input
              id="p-link"
              className="jm-input"
              type="url"
              value={link}
              placeholder="https://youtube.com/…"
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="p-desc">
            Description (optional)
          </label>
          <textarea
            id="p-desc"
            className="jm-textarea"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="p-url">
            Image or video
          </label>
          <input
            id="p-url"
            className="jm-input"
            value={url}
            placeholder="Paste a URL, or choose a file below"
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className={styles.uploadRow}>
            <input
              type="file"
              accept="image/*,video/*"
              className={styles.fileInput}
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void addProject(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="jm-btn-primary jm-btn-sm"
              onClick={() => addProject()}
              disabled={busy}
            >
              {busy ? "Working…" : "Add project"}
            </button>
          </div>
          <p className={styles.uploadNote}>
            Choosing a file uploads and adds it in one go.
          </p>
        </div>
      </div>

      {/* ── Existing ─────────────────────────── */}
      {projects === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : projects.length === 0 ? (
        <p className={styles.empty}>
          Nothing in this category yet — add your first piece above.
        </p>
      ) : (
        <div className={styles.list}>
          {projects.map((project, index) => (
            <article key={project.id} className={styles.row}>
              <div className={styles.thumbBox}>
                {project.type === "video" ? (
                  <span className={styles.thumbKind}>Video</span>
                ) : project.thumbnail || project.url ? (
                  // Remote Firebase Storage URLs, sized by CSS — next/image
                  // would need every future bucket allow-listed for no gain.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={project.thumbnail || project.url}
                    alt=""
                    className={styles.thumb}
                  />
                ) : (
                  <span className={styles.thumbKind}>No media</span>
                )}
              </div>

              <div className={styles.rowMain}>
                <h3 className={styles.rowTitle}>{project.title}</h3>
                {project.description ? (
                  <p className={styles.rowMeta}>{project.description}</p>
                ) : null}
                {project.link ? (
                  <p className={styles.squareLinks}>
                    <a
                      href={project.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {project.link}
                    </a>
                  </p>
                ) : null}
              </div>

              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${project.title} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => move(index, 1)}
                  disabled={index === projects.length - 1}
                  aria-label={`Move ${project.title} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="jm-btn-ghost jm-btn-sm"
                  onClick={() => setEditing(project)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => remove(project)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ── Edit ─────────────────────────────── */}
      {editing ? (
        <div
          className="jm-modal-overlay jm-open"
          role="dialog"
          aria-modal="true"
          aria-label="Edit project"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setEditing(null);
          }}
        >
          <div className="jm-modal" style={{ maxWidth: 520 }}>
            <div className="jm-modal-header">
              <h2 className="jm-modal-title">Edit project</h2>
              <button
                type="button"
                className="jm-modal-close"
                onClick={() => setEditing(null)}
                disabled={busy}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="e-title">
                Title
              </label>
              <input
                id="e-title"
                className="jm-input"
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="e-desc">
                Description
              </label>
              <textarea
                id="e-desc"
                className="jm-textarea"
                rows={3}
                value={editing.description ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="e-url">
                Media URL
              </label>
              <input
                id="e-url"
                className="jm-input"
                value={editing.url ?? ""}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
              />
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="e-link">
                Link
              </label>
              <input
                id="e-link"
                className="jm-input"
                value={editing.link ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, link: e.target.value })
                }
              />
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className="jm-btn-primary"
                onClick={saveEdit}
                disabled={busy}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                className="jm-btn-ghost"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
