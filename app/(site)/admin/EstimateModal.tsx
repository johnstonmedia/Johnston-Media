"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { findPackage } from "@/lib/packages";
import { formatMoney, type Quote } from "@/lib/types";

import styles from "./admin.module.css";

interface LineItem {
  name: string;
  /** Dollars, as typed. Converted to cents on submit. */
  amount: string;
  quantity: string;
}

interface EstimateModalProps {
  quote: Quote;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSent: (totalCents: number) => void;
}

/** Default validity: a fortnight, which is long enough to think and short
 *  enough that prices don't go stale. */
function defaultValidUntil(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

export default function EstimateModal({
  quote,
  getToken,
  onClose,
  onSent,
}: EstimateModalProps) {
  const { toast } = useToast();

  const [items, setItems] = useState<LineItem[]>(() => {
    // Re-sending? Start from what was quoted last time.
    if (quote.estimate?.lineItems.length) {
      return quote.estimate.lineItems.map((item) => ({
        name: item.name,
        amount: (item.amountCents / 100).toFixed(2),
        quantity: String(item.quantity ?? 1),
      }));
    }
    // Otherwise start from the package they chose, if any.
    const pkg = findPackage(quote.packageId);
    if (pkg?.lineItems?.length) {
      return pkg.lineItems.map((item) => ({
        name: item.name,
        amount: (item.amountCents / 100).toFixed(2),
        quantity: String(item.quantity ?? 1),
      }));
    }
    return [{ name: quote.serviceType || quote.name, amount: "", quantity: "1" }];
  });

  const [notes, setNotes] = useState(quote.estimate?.notes ?? "");
  const [validUntil, setValidUntil] = useState(
    quote.estimate?.validUntil ?? defaultValidUntil(),
  );
  const [sending, setSending] = useState(false);

  const totalCents = items.reduce((sum, item) => {
    const amount = Math.round(Number(item.amount) * 100);
    const qty = Number(item.quantity);
    if (!Number.isFinite(amount) || !Number.isFinite(qty)) return sum;
    return sum + amount * qty;
  }, 0);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  async function send() {
    if (sending || totalCents <= 0) return;

    setSending(true);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }

      const response = await fetch("/api/estimate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quoteId: quote.id,
          notes,
          validUntil,
          lineItems: items
            .filter((item) => item.name.trim() && Number(item.amount) > 0)
            .map((item) => ({
              name: item.name.trim(),
              amountCents: Math.round(Number(item.amount) * 100),
              quantity: Number(item.quantity) || 1,
            })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast(result.error ?? "Could not send the estimate.", "error");
        return;
      }

      toast(
        result.emailed
          ? `Estimate sent to ${quote.clientEmail}.`
          : "Estimate saved, but the email didn't send — check Resend.",
        result.emailed ? "success" : "error",
      );
      onSent(result.totalCents);
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="jm-modal-overlay jm-open"
      role="dialog"
      aria-modal="true"
      aria-label="Send estimate"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      <div className="jm-modal" style={{ maxWidth: 640 }}>
        <div className="jm-modal-header">
          <h2 className="jm-modal-title">
            {quote.estimate ? "Re-send estimate" : "Send estimate"}
          </h2>
          <button
            type="button"
            className="jm-modal-close"
            onClick={onClose}
            disabled={sending}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className={styles.rowMeta} style={{ marginBottom: "1.25rem" }}>
          <strong style={{ color: "var(--jm-white)" }}>{quote.name}</strong>
          <br />
          {quote.clientName} · {quote.serviceType}
        </p>

        <div className={styles.warning}>
          No money moves at this stage. {quote.clientName.split(/\s+/)[0]} gets
          an email and accepts or declines in their portal — then the invoice
          builder is ready with these figures.
        </div>

        <div className={styles.lineHead}>
          <span>Description</span>
          <span>Amount (AUD)</span>
          <span>Qty</span>
          <span />
        </div>

        {items.map((item, index) => (
          <div key={index} className={styles.lineItem}>
            <input
              className="jm-input"
              value={item.name}
              placeholder="Full-day shoot"
              onChange={(e) => updateItem(index, { name: e.target.value })}
            />
            <input
              className="jm-input"
              type="number"
              min="0"
              step="0.01"
              value={item.amount}
              placeholder="0.00"
              onChange={(e) => updateItem(index, { amount: e.target.value })}
            />
            <input
              className="jm-input"
              type="number"
              min="1"
              step="1"
              value={item.quantity}
              onChange={(e) => updateItem(index, { quantity: e.target.value })}
            />
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() =>
                setItems((prev) => prev.filter((_, i) => i !== index))
              }
              disabled={items.length === 1}
              aria-label="Remove line item"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          className="jm-btn-ghost jm-btn-sm"
          onClick={() =>
            setItems((prev) => [...prev, { name: "", amount: "", quantity: "1" }])
          }
        >
          + Add line item
        </button>

        <div className="jm-field" style={{ marginTop: "1.5rem" }}>
          <label className="jm-label" htmlFor="est-notes">
            Note to the client (optional)
          </label>
          <textarea
            id="est-notes"
            className="jm-textarea"
            rows={3}
            value={notes}
            placeholder="Includes travel to Newcastle, a full edit and delivery of final files…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="est-valid">
            Hold this price until
          </label>
          <input
            id="est-valid"
            className="jm-input"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </div>

        <div className={styles.total}>
          <span className={styles.totalLabel}>Estimate total</span>
          <span className={styles.totalValue}>{formatMoney(totalCents)}</span>
        </div>

        <div className={styles.modalActions}>
          <button
            type="button"
            className="jm-btn-primary"
            onClick={send}
            disabled={sending || totalCents <= 0}
          >
            {sending ? "Sending…" : "Send estimate"}
          </button>
          <button
            type="button"
            className="jm-btn-ghost"
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
