"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { formatMoney, type Quote } from "@/lib/types";

import styles from "./admin.module.css";

interface LineItem {
  name: string;
  /** Dollars, as typed. Converted to cents on submit. */
  amount: string;
  quantity: string;
}

interface InvoiceModalProps {
  quote: Quote;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSent: (result: { invoiceUrl?: string; amountCents: number }) => void;
}

/** Builds and sends a Square invoice for a quote. */
export default function InvoiceModal({
  quote,
  getToken,
  onClose,
  onSent,
}: InvoiceModalProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<LineItem[]>([
    { name: quote.serviceType || quote.name, amount: "", quantity: "1" },
  ]);
  const [dueInDays, setDueInDays] = useState("14");
  const [description, setDescription] = useState("");
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
    if (sending) return;

    if (totalCents <= 0) {
      toast("Add at least one line item with an amount.", "error");
      return;
    }

    setSending(true);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }

      const response = await fetch("/api/invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quoteId: quote.id,
          title: quote.name,
          description,
          dueInDays: Number(dueInDays) || 14,
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
        toast(result.error ?? "Could not send the invoice.", "error");
        return;
      }

      toast(`Invoice sent to ${quote.clientEmail}.`);
      onSent({ invoiceUrl: result.invoiceUrl, amountCents: result.amountCents });
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
      aria-label="Create invoice"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      <div className="jm-modal" style={{ maxWidth: 640 }}>
        <div className="jm-modal-header">
          <h2 className="jm-modal-title">Send invoice</h2>
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

        <div className={styles.warning}>
          Square will email <strong>{quote.clientEmail}</strong> a payment link,
          and the client gets a branded copy from Johnston Media. This
          can&apos;t be undone from here — cancel it in Square if you need to.
        </div>

        <p className={styles.rowMeta} style={{ marginBottom: "1.25rem" }}>
          <strong style={{ color: "var(--jm-white)" }}>{quote.name}</strong>
          <br />
          {quote.clientName} · {quote.serviceType}
        </p>

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
              placeholder="Half-day shoot"
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
            setItems((prev) => [
              ...prev,
              { name: "", amount: "", quantity: "1" },
            ])
          }
        >
          + Add line item
        </button>

        <div className="jm-field" style={{ marginTop: "1.5rem" }}>
          <label className="jm-label" htmlFor="inv-desc">
            Note on the invoice (optional)
          </label>
          <textarea
            id="inv-desc"
            className="jm-textarea"
            rows={3}
            value={description}
            placeholder="Includes travel, editing and delivery of final files…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="inv-due">
            Payment due in (days)
          </label>
          <input
            id="inv-due"
            className="jm-input"
            type="number"
            min="1"
            max="90"
            value={dueInDays}
            onChange={(e) => setDueInDays(e.target.value)}
          />
        </div>

        <div className={styles.total}>
          <span className={styles.totalLabel}>Total</span>
          <span className={styles.totalValue}>{formatMoney(totalCents)}</span>
        </div>

        <div className={styles.modalActions}>
          <button
            type="button"
            className="jm-btn-primary"
            onClick={send}
            disabled={sending || totalCents <= 0}
          >
            {sending ? "Sending…" : "Create & send invoice"}
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
