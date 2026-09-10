"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { PIPELINE_STAGES, type Quote } from "@/lib/types";

import styles from "./admin.module.css";

interface NewProjectModalProps {
  /** Quotes with no project yet — pick one to carry its details across. */
  quotes: Quote[];
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Opens a project.
 *
 * Projects also open by themselves when an invoice is paid, but plenty of work
 * arrives the other way round — a phone call, a returning client, a job you
 * already set up in Square — so this covers the rest.
 */
export default function NewProjectModal({
  quotes,
  getToken,
  onClose,
  onCreated,
}: NewProjectModalProps) {
  const { toast } = useToast();

  const [quoteId, setQuoteId] = useState("");
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [pipelineStage, setPipelineStage] = useState<string>("Booked");
  const [squareProjectUrl, setSquareProjectUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const linked = quotes.find((quote) => quote.id === quoteId);

  /** Picking a quote fills the rest in, but you can still override any of it. */
  function chooseQuote(id: string) {
    setQuoteId(id);
    const quote = quotes.find((item) => item.id === id);
    if (!quote) return;
    setName(quote.name);
    setClientName(quote.clientName);
    setClientEmail(quote.clientEmail);
    setServiceType(quote.serviceType);
  }

  async function create() {
    if (saving) return;

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }

      const response = await fetch("/api/project", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quoteId,
          name: name.trim(),
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          serviceType: serviceType.trim(),
          pipelineStage,
          squareProjectUrl: squareProjectUrl.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast(result.error ?? "Could not open the project.", "error");
        return;
      }

      toast(`Project opened for ${clientName.trim()}.`);
      onCreated();
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const ready = name.trim() !== "" && clientName.trim() !== "";

  return (
    <div
      className="jm-modal-overlay jm-open"
      role="dialog"
      aria-modal="true"
      aria-label="New project"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="jm-modal" style={{ maxWidth: 560 }}>
        <div className="jm-modal-header">
          <h2 className="jm-modal-title">New project</h2>
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

        {quotes.length > 0 ? (
          <div className="jm-field">
            <label className="jm-label" htmlFor="proj-quote">
              From a quote request (optional)
            </label>
            <select
              id="proj-quote"
              className="jm-select"
              value={quoteId}
              onChange={(e) => chooseQuote(e.target.value)}
            >
              <option value="">Start from scratch</option>
              {quotes.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {quote.clientName} — {quote.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {linked ? (
          <div className={styles.warning}>
            The quote, its estimate and any invoice stay linked to this project,
            so the whole job reads as one story.
          </div>
        ) : null}

        <div className="jm-field">
          <label className="jm-label" htmlFor="proj-name">
            Project name
          </label>
          <input
            id="proj-name"
            className="jm-input"
            value={name}
            placeholder="Round 12 vs Newcastle"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={styles.fieldRow}>
          <div className="jm-field">
            <label className="jm-label" htmlFor="proj-client">
              Client
            </label>
            <input
              id="proj-client"
              className="jm-input"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>

          <div className="jm-field">
            <label className="jm-label" htmlFor="proj-email">
              Client email
            </label>
            <input
              id="proj-email"
              className="jm-input"
              type="email"
              value={clientEmail}
              placeholder="Links their portal login"
              onChange={(e) => setClientEmail(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.fieldRow}>
          <div className="jm-field">
            <label className="jm-label" htmlFor="proj-service">
              Service
            </label>
            <input
              id="proj-service"
              className="jm-input"
              value={serviceType}
              placeholder="Sports videography"
              onChange={(e) => setServiceType(e.target.value)}
            />
          </div>

          <div className="jm-field">
            <label className="jm-label" htmlFor="proj-stage">
              Board stage
            </label>
            <select
              id="proj-stage"
              className="jm-select"
              value={pipelineStage}
              onChange={(e) => setPipelineStage(e.target.value)}
            >
              {PIPELINE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="proj-square">
            Square Projects link (optional)
          </label>
          <input
            id="proj-square"
            className="jm-input"
            type="url"
            value={squareProjectUrl}
            placeholder="Paste the card's URL from your Square board"
            onChange={(e) => setSquareProjectUrl(e.target.value)}
          />
        </div>

        <div className={styles.modalActions}>
          <button
            type="button"
            className="jm-btn-primary"
            onClick={create}
            disabled={saving || !ready}
          >
            {saving ? "Opening…" : "Open project"}
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
