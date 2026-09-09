"use client";

import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import { PROJECT_STAGES, type Project, type ProjectStage } from "@/lib/types";

import styles from "./admin.module.css";

export default function ProjectsPanel({
  getToken,
  onCount,
}: {
  getToken: () => Promise<string | null>;
  onCount: (n: number) => void;
}) {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(collection(getDb(), "projects"));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project);
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setProjects(rows);
    } catch (err) {
      console.error("[admin] projects failed:", err);
      setProjects([]);
      toast("Could not load projects.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (projects) {
      onCount(projects.filter((p) => p.status !== "Delivered").length);
    }
  }, [projects, onCount]);

  /**
   * Stage changes go through the API rather than a direct Firestore write so
   * the client's "project update" email always fires with the change.
   */
  async function changeStage(project: Project, stage: ProjectStage) {
    setUpdating(project.id);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }

      const response = await fetch("/api/project/stage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId: project.id, stage }),
      });
      const result = await response.json();

      if (!response.ok) {
        toast(result.error ?? "Could not update the stage.", "error");
        return;
      }

      setProjects(
        (prev) =>
          prev?.map((p) => (p.id === project.id ? { ...p, status: stage } : p)) ??
          null,
      );
      toast(
        result.emailed
          ? `Moved to ${stage} — client notified.`
          : `Moved to ${stage}.`,
      );
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <section>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Projects</h2>
      </div>

      {projects === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : projects.length === 0 ? (
        <p className={styles.empty}>
          Projects open automatically when an invoice is paid.
        </p>
      ) : (
        <div className={styles.list}>
          {projects.map((project) => (
            <article key={project.id} className={styles.row}>
              <div className={styles.rowMain}>
                <h3 className={styles.rowTitle}>{project.name}</h3>
                <p className={styles.rowMeta}>
                  {project.clientName} · {project.serviceType}
                </p>
              </div>

              <div className={styles.rowActions}>
                <span className="jm-badge jm-badge--copper">
                  {project.status}
                </span>
                <select
                  className="jm-select"
                  style={{ width: 160, padding: "0.45rem 2.5rem 0.45rem 0.85rem" }}
                  value={project.status}
                  disabled={updating === project.id}
                  onChange={(e) =>
                    changeStage(project, e.target.value as ProjectStage)
                  }
                  aria-label={`Stage for ${project.name}`}
                >
                  {PROJECT_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
