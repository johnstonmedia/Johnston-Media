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

interface InvoiceModalProps {
  quote: Quote;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSent: (result: {
    invoiceUrl?: string;
    amountCents: number;
    depositCents?: number;
  }) => void;
}

/** Builds and sends a Square invoice for a quote. */
export default function InvoiceModal({
  quote,
  getToken,
  onClose,
  onSent,
}: InvoiceModalProps) {
  const { toast } = useToast();
  // Best available starting point, in order: what the client actually agreed
  // to, then the package they picked, then a single blank line.
  const [items, setItems] = useState<LineItem[]>(() => {
    if (quote.estimate?.lineItems.length) {
      return quote.estimate.lineItems.map((item) => ({
        name: item.name,
        amount: (item.amountCents / 100).toFixed(2),
        quantity: String(item.quantity ?? 1),
      }));
    }
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
  const [dueInDays, setDueInDays] = useState("14");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  // Deposit — off by default, so invoicing in full stays one click.
  const [depositOn, setDepositOn] = useState(false);
  const [depositType, setDepositType] = useState<"percentage" | "fixed">(
    "percentage",
  );
  const [depositValue, setDepositValue] = useState("50");
  const [depositDueInDays, setDepositDueInDays] = useState("0");

  const totalCents = items.reduce((sum, item) => {
    const amount = Math.round(Number(item.amount) * 100);
    const qty = Number(item.quantity);
    if (!Number.isFinite(amount) || !Number.isFinite(qty)) return sum;
    return sum + amount * qty;
  }, 0);

  const depositCents = (() => {
    if (!depositOn) return 0;
    const value = Number(depositValue);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return depositType === "percentage"
      ? Math.round((totalCents * value) / 100)
      : Math.round(value * 100);
  })();

  const depositValid =
    !depositOn || (depositCents > 0 && depositCents < totalCents);

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

    if (!depositValid) {
      toast("The deposit must be more than zero and less than the total.", "error");
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
          deposit: depositOn
            ? {
                type: depositType,
                value: Number(depositValue),
                dueInDays: Number(depositDueInDays) || 0,
              }
            : undefined,
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
      onSent({
        invoiceUrl: result.invoiceUrl,
        amountCents: result.amountCents,
        depositCents: result.depositCents,
      });
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
            {depositOn ? "Balance due in (days)" : "Payment due in (days)"}
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

        {/* ─── Deposit ──────────────────────────────── */}
        <div className={styles.depositBox}>
          <label className={styles.depositToggle}>
            <input
              type="checkbox"
              checked={depositOn}
              onChange={(e) => setDepositOn(e.target.checked)}
            />
            <span>
              Take a deposit up front
              <em>Holds the date. The balance is due later, same link.</em>
            </span>
          </label>

          {depositOn ? (
            <div className={styles.depositFields}>
              <div className="jm-field">
                <label className="jm-label" htmlFor="dep-type">
                  Deposit as
                </label>
                <select
                  id="dep-type"
                  className="jm-select"
                  value={depositType}
                  onChange={(e) =>
                    setDepositType(e.target.value as "percentage" | "fixed")
                  }
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </div>

              <div className="jm-field">
                <label className="jm-label" htmlFor="dep-value">
                  {depositType === "percentage" ? "Percent (%)" : "Amount (AUD)"}
                </label>
                <input
                  id="dep-value"
                  className="jm-input"
                  type="number"
                  min={depositType === "percentage" ? "1" : "0"}
                  max={depositType === "percentage" ? "99" : undefined}
                  step={depositType === "percentage" ? "1" : "0.01"}
                  value={depositValue}
                  onChange={(e) => setDepositValue(e.target.value)}
                />
              </div>

              <div className="jm-field">
                <label className="jm-label" htmlFor="dep-due">
                  Due in (days)
                </label>
                <input
                  id="dep-due"
                  className="jm-input"
                  type="number"
                  min="0"
                  max="90"
                  value={depositDueInDays}
                  onChange={(e) => setDepositDueInDays(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {depositOn && !depositValid && totalCents > 0 ? (
            <p className="jm-field-error">
              The deposit must be more than zero and less than the total.
            </p>
          ) : null}
        </div>

        <div className={styles.total}>
          <span className={styles.totalLabel}>Total</span>
          <span className={styles.totalValue}>{formatMoney(totalCents)}</span>
        </div>

        {depositOn && depositValid && depositCents > 0 ? (
          <div className={styles.splitRow}>
            <span>
              Deposit {depositDueInDays === "0" ? "on receipt" : `in ${depositDueInDays} days`}
              <strong>{formatMoney(depositCents)}</strong>
            </span>
            <span>
              Balance in {dueInDays} days
              <strong>{formatMoney(totalCents - depositCents)}</strong>
            </span>
          </div>
        ) : null}

        <div className={styles.modalActions}>
          <button
            type="button"
            className="jm-btn-primary"
            onClick={send}
            disabled={sending || totalCents <= 0 || !depositValid}
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
