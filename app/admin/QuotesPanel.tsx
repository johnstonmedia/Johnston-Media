"use client";

import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import {
  SQUARE_DASHBOARD,
  squareCustomerUrl,
  squareInvoiceUrl,
} from "@/lib/squareLinks";
import { formatMoney, type Quote, type QuoteStatus } from "@/lib/types";

import styles from "./admin.module.css";
import EstimateModal from "./EstimateModal";
import InvoiceModal from "./InvoiceModal";

/** Statuses that need no further action from you. */
const CLOSED: readonly QuoteStatus[] = [
  "Paid",
  "Declined",
  "Cancelled",
  "Refunded",
];

/** Statuses where sending (or re-sending) an estimate makes sense. */
const CAN_ESTIMATE: readonly QuoteStatus[] = [
  "Pending",
  "Reviewed",
  "Estimate Sent",
  "Declined",
  "Sent",
];

const FILTERS: { id: string; label: string; match: (q: Quote) => boolean }[] = [
  { id: "open", label: "Open", match: (q) => !CLOSED.includes(q.status) },
  { id: "new", label: "New", match: (q) => q.status === "Pending" },
  {
    id: "estimates",
    label: "Awaiting reply",
    match: (q) => q.status === "Estimate Sent",
  },
  { id: "accepted", label: "Accepted", match: (q) => q.status === "Accepted" },
  {
    id: "awaiting",
    label: "Awaiting payment",
    match: (q) => q.status === "Invoiced" || q.status === "Deposit Paid",
  },
  { id: "paid", label: "Paid", match: (q) => q.status === "Paid" },
  { id: "web", label: "Web", match: (q) => q.source === "web" },
  { id: "all", label: "All", match: () => true },
];

function statusTone(status: QuoteStatus): string {
  switch (status) {
    case "Paid":
    case "Approved":
    case "Accepted":
      return "jm-badge--success";
    case "Invoiced":
    case "Sent":
    case "Deposit Paid":
      return "jm-badge--copper";
    case "Declined":
    case "Cancelled":
    case "Refunded":
      return "jm-badge--error";
    case "Estimate Sent":
    case "Reviewed":
      return "jm-badge--teal";
    default:
      return "jm-badge--amber";
  }
}

export default function QuotesPanel({
  getToken,
  onCount,
}: {
  getToken: () => Promise<string | null>;
  onCount: (n: number) => void;
}) {
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [filter, setFilter] = useState("open");
  const [invoicing, setInvoicing] = useState<Quote | null>(null);
  const [estimating, setEstimating] = useState<Quote | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(collection(getDb(), "quotes"));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Quote);
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setQuotes(rows);
    } catch (err) {
      console.error("[admin] quotes failed:", err);
      setQuotes([]);
      toast("Could not load quotes.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // The badge counts what needs you: new requests plus accepted estimates
  // waiting to be invoiced.
  useEffect(() => {
    if (quotes) {
      onCount(
        quotes.filter((q) => q.status === "Pending" || q.status === "Accepted")
          .length,
      );
    }
  }, [quotes, onCount]);

  function patch(id: string, changes: Partial<Quote>) {
    setQuotes(
      (prev) => prev?.map((q) => (q.id === id ? { ...q, ...changes } : q)) ?? null,
    );
  }

  async function setStatus(quote: Quote, status: QuoteStatus) {
    try {
      await updateDoc(doc(getDb(), "quotes", quote.id), {
        status,
        updatedAt: new Date().toISOString(),
      });
      patch(quote.id, { status });
      toast(`Marked as ${status}.`);
    } catch (err) {
      console.error("[admin] status update failed:", err);
      toast("Could not update the quote.", "error");
    }
  }

  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const visible = quotes?.filter(active.match) ?? [];

  return (
    <section>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Quote requests</h2>
        <div className={styles.filters}>
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.filter} ${
                filter === item.id ? styles.filterActive : ""
              }`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {quotes === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : visible.length === 0 ? (
        <p className={styles.empty}>Nothing here right now.</p>
      ) : (
        <div className={styles.list}>
          {visible.map((quote) => {
            const estimate = quote.estimate;
            const dashInvoice = squareInvoiceUrl(quote.squareInvoiceId);
            const dashCustomer = squareCustomerUrl(quote.squareCustomerId);

            return (
              <article key={quote.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <h3 className={styles.rowTitle}>
                    {quote.name}{" "}
                    {quote.source === "web" ? (
                      <span className="jm-badge jm-badge--teal">Web</span>
                    ) : null}
                  </h3>
                  <p className={styles.rowMeta}>
                    {quote.clientName} · {quote.clientEmail}
                    {quote.clientPhone ? ` · ${quote.clientPhone}` : ""}
                    <br />
                    {quote.serviceType}
                    {quote.date ? ` · ${quote.date}` : ""}
                    {quote.location ? ` · ${quote.location}` : ""}
                    {quote.budget ? ` · Budget: ${quote.budget}` : ""}
                  </p>

                  {quote.details ? (
                    <p className={styles.rowDetails}>{quote.details}</p>
                  ) : null}

                  {estimate ? (
                    <p className={styles.estimateNote}>
                      <strong>
                        Estimate {formatMoney(estimate.totalCents, estimate.currency)}
                      </strong>
                      {estimate.acceptedAt
                        ? ` · accepted ${new Date(estimate.acceptedAt).toLocaleDateString("en-AU")}`
                        : estimate.declinedAt
                          ? ` · declined ${new Date(estimate.declinedAt).toLocaleDateString("en-AU")}`
                          : estimate.validUntil
                            ? ` · awaiting reply, holds to ${estimate.validUntil}`
                            : " · awaiting reply"}
                      {estimate.declineReason ? ` — “${estimate.declineReason}”` : ""}
                    </p>
                  ) : null}

                  {/* Square linkage, so a record here maps to one over there. */}
                  {quote.squareInvoiceNumber || quote.squareCustomerId ? (
                    <p className={styles.squareLinks}>
                      {quote.squareInvoiceNumber ? (
                        <a
                          href={dashInvoice ?? SQUARE_DASHBOARD.invoices}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Square invoice #{quote.squareInvoiceNumber}
                        </a>
                      ) : null}
                      {quote.squareCustomerId ? (
                        <a
                          href={dashCustomer ?? SQUARE_DASHBOARD.customers}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Customer record
                        </a>
                      ) : null}
                    </p>
                  ) : null}
                </div>

                <div className={styles.rowActions}>
                  {quote.amountCents !== undefined ? (
                    <span className={styles.amount}>
                      {formatMoney(quote.amountCents, quote.currency)}
                      {quote.depositCents ? (
                        <small className={styles.depositNote}>
                          {formatMoney(quote.depositCents, quote.currency)} deposit
                        </small>
                      ) : null}
                    </span>
                  ) : null}

                  <span className={`jm-badge ${statusTone(quote.status)}`}>
                    {quote.status}
                  </span>

                  {CAN_ESTIMATE.includes(quote.status) && !quote.squareInvoiceId ? (
                    <button
                      type="button"
                      className={
                        quote.status === "Estimate Sent"
                          ? "jm-btn-ghost jm-btn-sm"
                          : "jm-btn-primary jm-btn-sm"
                      }
                      onClick={() => setEstimating(quote)}
                    >
                      {quote.status === "Estimate Sent"
                        ? "Re-send estimate"
                        : "Send estimate"}
                    </button>
                  ) : null}

                  {quote.squarePublicUrl ? (
                    <a
                      href={quote.squarePublicUrl}
                      className="jm-btn-ghost jm-btn-sm"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View invoice
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={
                        quote.status === "Accepted"
                          ? "jm-btn-primary jm-btn-sm"
                          : "jm-btn-ghost jm-btn-sm"
                      }
                      onClick={() => setInvoicing(quote)}
                    >
                      Send invoice
                    </button>
                  )}

                  {quote.status === "Pending" ? (
                    <button
                      type="button"
                      className="jm-btn-ghost jm-btn-sm"
                      onClick={() => setStatus(quote, "Reviewed")}
                    >
                      Mark reviewed
                    </button>
                  ) : null}

                  {!CLOSED.includes(quote.status) ? (
                    <button
                      type="button"
                      className="jm-btn-ghost jm-btn-sm"
                      onClick={() => setStatus(quote, "Declined")}
                    >
                      Decline
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {estimating ? (
        <EstimateModal
          quote={estimating}
          getToken={getToken}
          onClose={() => setEstimating(null)}
          onSent={() => {
            setEstimating(null);
            // Re-read so the stored estimate (and its timestamps) are exact.
            void load();
          }}
        />
      ) : null}

      {invoicing ? (
        <InvoiceModal
          quote={invoicing}
          getToken={getToken}
          onClose={() => setInvoicing(null)}
          onSent={(result) => {
            patch(invoicing.id, {
              status: "Invoiced",
              squarePublicUrl: result.invoiceUrl,
              amountCents: result.amountCents,
              depositCents: result.depositCents,
            });
            setInvoicing(null);
          }}
        />
      ) : null}
    </section>
  );
}
