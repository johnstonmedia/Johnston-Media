"use client";

import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import { formatMoney, type Quote, type QuoteStatus } from "@/lib/types";

import styles from "./admin.module.css";
import InvoiceModal from "./InvoiceModal";

const FILTERS: { id: string; label: string; match: (q: Quote) => boolean }[] = [
  { id: "open", label: "Open", match: (q) => q.status !== "Paid" && q.status !== "Declined" },
  { id: "new", label: "New", match: (q) => q.status === "Pending" },
  { id: "invoiced", label: "Invoiced", match: (q) => q.status === "Invoiced" },
  { id: "paid", label: "Paid", match: (q) => q.status === "Paid" },
  { id: "web", label: "Web", match: (q) => q.source === "web" },
  { id: "all", label: "All", match: () => true },
];

function statusTone(status: QuoteStatus): string {
  switch (status) {
    case "Paid":
    case "Approved":
      return "jm-badge--success";
    case "Invoiced":
    case "Sent":
      return "jm-badge--copper";
    case "Declined":
      return "jm-badge--error";
    case "Accepted":
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

  useEffect(() => {
    if (quotes) {
      onCount(quotes.filter((q) => q.status === "Pending").length);
    }
  }, [quotes, onCount]);

  async function setStatus(quote: Quote, status: QuoteStatus) {
    try {
      await updateDoc(doc(getDb(), "quotes", quote.id), {
        status,
        updatedAt: new Date().toISOString(),
      });
      setQuotes(
        (prev) =>
          prev?.map((q) => (q.id === quote.id ? { ...q, status } : q)) ?? null,
      );
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
          {visible.map((quote) => (
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
              </div>

              <div className={styles.rowActions}>
                {quote.amountCents !== undefined ? (
                  <span className={styles.amount}>
                    {formatMoney(quote.amountCents, quote.currency)}
                  </span>
                ) : null}

                <span className={`jm-badge ${statusTone(quote.status)}`}>
                  {quote.status}
                </span>

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
                    className="jm-btn-primary jm-btn-sm"
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

                {quote.status !== "Paid" && quote.status !== "Declined" ? (
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
          ))}
        </div>
      )}

      {invoicing ? (
        <InvoiceModal
          quote={invoicing}
          getToken={getToken}
          onClose={() => setInvoicing(null)}
          onSent={(result) => {
            setQuotes(
              (prev) =>
                prev?.map((q) =>
                  q.id === invoicing.id
                    ? {
                        ...q,
                        status: "Invoiced",
                        squarePublicUrl: result.invoiceUrl,
                        amountCents: result.amountCents,
                      }
                    : q,
                ) ?? null,
            );
            setInvoicing(null);
          }}
        />
      ) : null}
    </section>
  );
}
