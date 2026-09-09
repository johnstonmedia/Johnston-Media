"use client";

import { useState } from "react";

import DemoFrame from "./DemoFrame";
import styles from "./demos.module.css";

type Role = "client" | "studio";
type Tab = "project" | "estimate" | "invoice" | "files" | "messages";

const TABS: { id: Tab; label: string }[] = [
  { id: "project", label: "Project" },
  { id: "estimate", label: "Estimate" },
  { id: "invoice", label: "Invoice" },
  { id: "files", label: "Files" },
  { id: "messages", label: "Messages" },
];

const STAGES = ["Planning", "Shooting", "Editing", "Delivering", "Delivered"];

const LINE_ITEMS = [
  { name: "Full-day shoot — two photographers", amount: 1800 },
  { name: "Aerial coverage (licensed drone)", amount: 650 },
  { name: "Edited gallery + highlight reel", amount: 750 },
];

const FILES = [
  { name: "Highlights_4K.mp4", size: "1.2 GB", kind: "Video" },
  { name: "Gallery_Full_Resolution.zip", size: "3.8 GB", kind: "Photos" },
  { name: "Social_Cutdowns.zip", size: "420 MB", kind: "Video" },
];

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(n);

const TOTAL = LINE_ITEMS.reduce((sum, item) => sum + item.amount, 0);
const DEPOSIT = Math.round(TOTAL * 0.3);

/**
 * A working client portal, on the page.
 *
 * Everything here is real interface behaviour running on local state — accept
 * the estimate and the invoice appears; pay the deposit and the project opens;
 * flip to the studio side and the same job is sitting there updated. It's the
 * quickest way to show what a portal actually feels like without asking anyone
 * to imagine it.
 */
export default function PortalDemo() {
  const [role, setRole] = useState<Role>("client");
  const [tab, setTab] = useState<Tab>("estimate");

  // Shared job state — both roles read and write the same thing.
  const [estimate, setEstimate] = useState<"sent" | "accepted" | "declined">(
    "sent",
  );
  const [invoice, setInvoice] = useState<"none" | "sent" | "deposit" | "paid">(
    "none",
  );
  const [stage, setStage] = useState(0);
  const [notified, setNotified] = useState<string | null>(null);

  /** Tiny toast, so an action visibly does something. */
  function ping(message: string) {
    setNotified(message);
    window.setTimeout(() => setNotified(null), 2600);
  }

  function acceptEstimate() {
    setEstimate("accepted");
    setInvoice("sent");
    ping("Estimate accepted — invoice raised in Square");
    setTab("invoice");
  }

  function payDeposit() {
    setInvoice("deposit");
    setStage(1);
    ping("Deposit paid — project opened, receipt emailed");
    setTab("project");
  }

  function payBalance() {
    setInvoice("paid");
    ping("Paid in full — receipt emailed");
  }

  function resetDemo() {
    setEstimate("sent");
    setInvoice("none");
    setStage(0);
    setTab("estimate");
    ping("Demo reset");
  }

  const stageBadge =
    invoice === "none" ? "Enquiry" : invoice === "sent" ? "Proposal" : "Booked";

  return (
    <DemoFrame
      url={role === "client" ? "yourstudio.com/portal" : "yourstudio.com/admin"}
      label="Try it — a client portal"
      footnote={
        <>
          Click through it — accepting the estimate raises the invoice, paying
          the deposit opens the project. Switch to the studio side to see the
          same job from your desk.
        </>
      }
    >
      <div className={styles.portal}>
        {/* Whose screen you're looking at. */}
        <div className={styles.roleBar}>
          <div className={styles.roleSwitch} role="group" aria-label="View as">
            <button
              type="button"
              className={`${styles.roleBtn} ${role === "client" ? styles.roleOn : ""}`}
              onClick={() => setRole("client")}
              aria-pressed={role === "client"}
            >
              Your client sees
            </button>
            <button
              type="button"
              className={`${styles.roleBtn} ${role === "studio" ? styles.roleOn : ""}`}
              onClick={() => setRole("studio")}
              aria-pressed={role === "studio"}
            >
              You see
            </button>
          </div>

          <button type="button" className={styles.resetBtn} onClick={resetDemo}>
            Reset
          </button>
        </div>

        {role === "client" ? (
          <ClientView
            tab={tab}
            setTab={setTab}
            estimate={estimate}
            invoice={invoice}
            stage={stage}
            onAccept={acceptEstimate}
            onDecline={() => {
              setEstimate("declined");
              ping("Declined — the studio is notified");
            }}
            onPayDeposit={payDeposit}
            onPayBalance={payBalance}
          />
        ) : (
          <StudioView
            estimate={estimate}
            invoice={invoice}
            stage={stage}
            stageBadge={stageBadge}
            onStage={(next) => {
              setStage(next);
              ping(`Moved to ${STAGES[next]} — client emailed`);
            }}
          />
        )}

        <div
          className={`${styles.toast} ${notified ? styles.toastOn : ""}`}
          role="status"
          aria-live="polite"
        >
          {notified}
        </div>
      </div>
    </DemoFrame>
  );
}

/* ── The client's side ─────────────────────────────── */

function ClientView({
  tab,
  setTab,
  estimate,
  invoice,
  stage,
  onAccept,
  onDecline,
  onPayDeposit,
  onPayBalance,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  estimate: "sent" | "accepted" | "declined";
  invoice: "none" | "sent" | "deposit" | "paid";
  stage: number;
  onAccept: () => void;
  onDecline: () => void;
  onPayDeposit: () => void;
  onPayBalance: () => void;
}) {
  return (
    <>
      <div className={styles.portalHead}>
        <div>
          <span className={styles.portalEyebrow}>Your projects</span>
          <h4 className={styles.portalTitle}>Spring campaign shoot</h4>
        </div>
        <span className={styles.avatar} aria-hidden="true">
          MC
        </span>
      </div>

      <nav className={styles.tabs} role="tablist" aria-label="Portal sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`${styles.tab} ${tab === item.id ? styles.tabOn : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === "estimate" && estimate === "sent" ? (
              <span className={styles.dot} aria-label="needs your reply" />
            ) : null}
            {item.id === "invoice" && invoice === "sent" ? (
              <span className={styles.dot} aria-label="payment due" />
            ) : null}
          </button>
        ))}
      </nav>

      <div className={styles.panel}>
        {tab === "project" ? (
          <>
            <div className={styles.track}>
              {STAGES.map((name, i) => (
                <div
                  key={name}
                  className={`${styles.trackStep} ${i <= stage ? styles.trackDone : ""}`}
                >
                  <span className={styles.trackDot} aria-hidden="true" />
                  <span className={styles.trackName}>{name}</span>
                </div>
              ))}
            </div>
            <p className={styles.panelNote}>
              {invoice === "none"
                ? "Your project opens as soon as the deposit is paid."
                : `Currently ${STAGES[stage].toLowerCase()}. You'll get an email each time this moves.`}
            </p>
          </>
        ) : null}

        {tab === "estimate" ? (
          <>
            <div className={styles.docHead}>
              <span>Estimate EST-0042</span>
              <span
                className={`jm-badge ${
                  estimate === "accepted"
                    ? "jm-badge--success"
                    : estimate === "declined"
                      ? "jm-badge--error"
                      : "jm-badge--amber"
                }`}
              >
                {estimate === "sent" ? "Awaiting your reply" : estimate}
              </span>
            </div>

            <ul className={styles.lines}>
              {LINE_ITEMS.map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <span>{money(item.amount)}</span>
                </li>
              ))}
            </ul>
            <div className={styles.lineTotal}>
              <span>Total</span>
              <strong>{money(TOTAL)}</strong>
            </div>

            {estimate === "sent" ? (
              <div className={styles.actions}>
                <button
                  type="button"
                  className="jm-btn-primary jm-btn-sm"
                  onClick={onAccept}
                >
                  Accept estimate
                </button>
                <button
                  type="button"
                  className="jm-btn-ghost jm-btn-sm"
                  onClick={onDecline}
                >
                  Decline
                </button>
              </div>
            ) : (
              <p className={styles.panelNote}>
                {estimate === "accepted"
                  ? "Accepted — the invoice has been raised with these exact figures, so nothing can drift."
                  : "Declined. The studio has been told, and can send a revised estimate."}
              </p>
            )}
          </>
        ) : null}

        {tab === "invoice" ? (
          invoice === "none" ? (
            <p className={styles.empty}>
              Nothing to pay yet — an invoice appears once you&rsquo;ve accepted
              an estimate.
            </p>
          ) : (
            <>
              <div className={styles.docHead}>
                <span>Invoice #000123</span>
                <span
                  className={`jm-badge ${
                    invoice === "paid"
                      ? "jm-badge--success"
                      : invoice === "deposit"
                        ? "jm-badge--teal"
                        : "jm-badge--amber"
                  }`}
                >
                  {invoice === "sent"
                    ? "Deposit due"
                    : invoice === "deposit"
                      ? "Deposit paid"
                      : "Paid in full"}
                </span>
              </div>

              <div className={styles.payGrid}>
                <div>
                  <span className={styles.payLabel}>Deposit (30%)</span>
                  <strong className={styles.payValue}>{money(DEPOSIT)}</strong>
                </div>
                <div>
                  <span className={styles.payLabel}>Balance on delivery</span>
                  <strong className={styles.payValue}>
                    {money(TOTAL - DEPOSIT)}
                  </strong>
                </div>
              </div>

              {invoice === "sent" ? (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="jm-btn-primary jm-btn-sm"
                    onClick={onPayDeposit}
                  >
                    Pay deposit — {money(DEPOSIT)}
                  </button>
                  <span className={styles.secure}>Card payment via Square</span>
                </div>
              ) : invoice === "deposit" ? (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="jm-btn-primary jm-btn-sm"
                    onClick={onPayBalance}
                  >
                    Pay balance — {money(TOTAL - DEPOSIT)}
                  </button>
                  <span className={styles.secure}>
                    Reminders send themselves
                  </span>
                </div>
              ) : (
                <p className={styles.panelNote}>
                  Paid in full. Receipt emailed automatically.
                </p>
              )}
            </>
          )
        ) : null}

        {tab === "files" ? (
          stage >= 3 ? (
            <ul className={styles.fileList}>
              {FILES.map((file) => (
                <li key={file.name}>
                  <span className={styles.fileKind}>{file.kind}</span>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileSize}>{file.size}</span>
                  <span className={styles.fileGet}>Download</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              Your files appear here the moment they&rsquo;re ready — no
              WeTransfer links that expire in a week.
            </p>
          )
        ) : null}

        {tab === "messages" ? (
          <div className={styles.thread}>
            <div className={styles.msg}>
              <span className={styles.msgWho}>Studio</span>
              <p>
                Morning — weather looks good for Thursday. Shall we start at the
                warehouse and move outside around 2pm for the light?
              </p>
            </div>
            <div className={`${styles.msg} ${styles.msgMine}`}>
              <span className={styles.msgWho}>You</span>
              <p>Perfect. I&rsquo;ll have the team there from 9.</p>
            </div>
            <div className={styles.composer} aria-hidden="true">
              <span>Write a message…</span>
              <span className={styles.send}>Send</span>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

/* ── Your side ─────────────────────────────────────── */

function StudioView({
  estimate,
  invoice,
  stage,
  stageBadge,
  onStage,
}: {
  estimate: "sent" | "accepted" | "declined";
  invoice: "none" | "sent" | "deposit" | "paid";
  stage: number;
  stageBadge: string;
  onStage: (next: number) => void;
}) {
  const chain = [
    { label: "Request", detail: "Web enquiry · 2 Sep", done: true },
    {
      label: "Estimate",
      detail:
        estimate === "accepted"
          ? `${money(TOTAL)} · accepted`
          : estimate === "declined"
            ? "Declined"
            : `${money(TOTAL)} · awaiting reply`,
      done: estimate === "accepted",
    },
    {
      label: "Invoice",
      detail:
        invoice === "none"
          ? "Not raised"
          : invoice === "sent"
            ? "Deposit due"
            : invoice === "deposit"
              ? `${money(DEPOSIT)} of ${money(TOTAL)}`
              : "Paid in full",
      done: invoice === "paid",
    },
    {
      label: "Delivery",
      detail: invoice === "none" ? "Not started" : STAGES[stage],
      done: stage >= STAGES.length - 1,
    },
  ];

  return (
    <>
      <div className={styles.portalHead}>
        <div>
          <span className={styles.portalEyebrow}>Studio · Projects</span>
          <h4 className={styles.portalTitle}>Spring campaign shoot</h4>
        </div>
        <span className="jm-badge jm-badge--teal">{stageBadge}</span>
      </div>

      <div className={styles.panel}>
        <p className={styles.rowMetaLine}>Marlow &amp; Co · Commercial</p>

        <ol className={styles.chain}>
          {chain.map((step) => (
            <li
              key={step.label}
              className={`${styles.chainStep} ${step.done ? styles.chainDone : ""}`}
            >
              <span className={styles.chainLabel}>{step.label}</span>
              <span className={styles.chainDetail}>{step.detail}</span>
            </li>
          ))}
        </ol>

        <div className={styles.studioControls}>
          <span className={styles.payLabel}>Move production stage</span>
          <div className={styles.stageBtns}>
            {STAGES.map((name, i) => (
              <button
                key={name}
                type="button"
                className={`${styles.stageBtn} ${i === stage ? styles.stageOn : ""}`}
                onClick={() => onStage(i)}
                disabled={invoice === "none"}
                aria-pressed={i === stage}
              >
                {name}
              </button>
            ))}
          </div>
          <p className={styles.panelNote}>
            {invoice === "none"
              ? "The project opens once the deposit clears — accept the estimate on the client side first."
              : "Every move emails the client and updates their progress bar. Nothing to write by hand."}
          </p>
        </div>
      </div>
    </>
  );
}
