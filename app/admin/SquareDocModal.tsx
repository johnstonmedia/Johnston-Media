"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { SQUARE_DASHBOARD } from "@/lib/squareLinks";
import type { Project, SquareDocKind, SquareDocRef } from "@/lib/types";

import styles from "./admin.module.css";

interface SquareDocModalProps {
  project: Project;
  kind: SquareDocKind;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (kind: SquareDocKind, record: SquareDocRef) => void;
}

const COPY: Record<
  SquareDocKind,
  { title: string; dashboard: string; statuses: string[]; sent: string; resolved: string }
> = {
  estimate: {
    title: "estimate",
    dashboard: SQUARE_DASHBOARD.estimates,
    statuses: ["Draft", "Sent", "Accepted", "Declined", "Expired"],
    sent: "Sent on",
    resolved: "Accepted on",
  },
  contract: {
    title: "contract",
    dashboard: SQUARE_DASHBOARD.invoices,
    statuses: ["Draft", "Sent", "Signed", "Declined", "Cancelled"],
    sent: "Sent on",
    resolved: "Signed on",
  },
};

/**
 * Records an estimate or contract that lives in Square.
 *
 * Square has no API for either — both are Dashboard-only — so this is a
 * deliberate bit of double entry: you make the document in Square, then note
 * the handful of facts here that let the project timeline tell the whole story.
 */
export default function SquareDocModal({
  project,
  kind,
  getToken,
  onClose,
  onSaved,
}: SquareDocModalProps) {
  const { toast } = useToast();
  const copy = COPY[kind];
  const existing = kind === "estimate" ? project.estimateRef : project.contractRef;

  const [reference, setReference] = useState(existing?.reference ?? "");
  const [amount, setAmount] = useState(
    existing?.amountCents !== undefined
      ? (existing.amountCents / 100).toFixed(2)
      : "",
  );
  const [url, setUrl] = useState(existing?.url ?? "");
  const [status, setStatus] = useState(existing?.status ?? copy.statuses[1]);
  const [sentAt, setSentAt] = useState(existing?.sentAt ?? "");
  const [resolvedAt, setResolvedAt] = useState(existing?.resolvedAt ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [visibleToClient, setVisibleToClient] = useState(
    existing?.visibleToClient ?? false,
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }

      const response = await fetch("/api/project/record", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          kind,
          reference: reference.trim(),
          amountCents: amount === "" ? "" : Math.round(Number(amount) * 100),
          url: url.trim(),
          status,
          sentAt,
          resolvedAt,
          note,
          visibleToClient,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast(result.error ?? `Could not save the ${copy.title}.`, "error");
        return;
      }

      toast(
        visibleToClient
          ? `${copy.title[0].toUpperCase()}${copy.title.slice(1)} recorded and visible in the portal.`
          : `${copy.title[0].toUpperCase()}${copy.title.slice(1)} recorded.`,
      );
      onSaved(kind, result.record as SquareDocRef);
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="jm-modal-overlay jm-open"
      role="dialog"
      aria-modal="true"
      aria-label={`Record ${copy.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="jm-modal" style={{ maxWidth: 560 }}>
        <div className="jm-modal-header">
          <h2 className="jm-modal-title">
            {existing ? `Update ${copy.title}` : `Record ${copy.title}`}
          </h2>
          <button
            type="button"
            className="jm-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className={styles.rowMeta} style={{ marginBottom: "1.25rem" }}>
          <strong style={{ color: "var(--jm-white)" }}>{project.name}</strong>
          <br />
          {project.clientName}
        </p>

        <div className={styles.warning}>
          Make the {copy.title} in Square first, then note it here so the
          timeline is complete.{" "}
          <a
            href={copy.dashboard}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--jm-amber)", textDecoration: "underline" }}
          >
            Open Square →
          </a>
        </div>

        <div className={styles.fieldRow}>
          <div className="jm-field">
            <label className="jm-label" htmlFor="doc-ref">
              Reference
            </label>
            <input
              id="doc-ref"
              className="jm-input"
              value={reference}
              placeholder="EST-0042"
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="jm-field">
            <label className="jm-label" htmlFor="doc-amount">
              Total (AUD)
            </label>
            <input
              id="doc-amount"
              className="jm-input"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="doc-url">
            Link
          </label>
          <input
            id="doc-url"
            className="jm-input"
            type="url"
            value={url}
            placeholder="https://squareup.com/…"
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="doc-status">
            Status
          </label>
          <select
            id="doc-status"
            className="jm-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {copy.statuses.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.fieldRow}>
          <div className="jm-field">
            <label className="jm-label" htmlFor="doc-sent">
              {copy.sent}
            </label>
            <input
              id="doc-sent"
              className="jm-input"
              type="date"
              value={sentAt}
              onChange={(e) => setSentAt(e.target.value)}
            />
          </div>

          <div className="jm-field">
            <label className="jm-label" htmlFor="doc-resolved">
              {copy.resolved}
            </label>
            <input
              id="doc-resolved"
              className="jm-input"
              type="date"
              value={resolvedAt}
              onChange={(e) => setResolvedAt(e.target.value)}
            />
          </div>
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="doc-note">
            Note (optional)
          </label>
          <textarea
            id="doc-note"
            className="jm-textarea"
            rows={2}
            value={note}
            placeholder="Two shoot days, second date to be confirmed."
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <label className={styles.depositToggle}>
          <input
            type="checkbox"
            checked={visibleToClient}
            onChange={(e) => setVisibleToClient(e.target.checked)}
          />
          <span>
            Show this in {project.clientName.split(/\s+/)[0]}&rsquo;s portal
          </span>
        </label>

        <div className={styles.modalActions}>
          <button
            type="button"
            className="jm-btn-primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="jm-btn-ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
