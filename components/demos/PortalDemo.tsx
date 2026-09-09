"use client";

import { useState } from "react";

import {
  INDUSTRIES,
  industryTotal,
  type DemoIndustry,
} from "@/lib/demoIndustries";

import DemoFrame from "./DemoFrame";
import styles from "./demos.module.css";

type Role = "client" | "studio";
type Tab = "project" | "estimate" | "invoice" | "files" | "messages";

/** "Files" reads wrong to a builder and "Project" reads wrong to a caterer,
 *  so two of the five take their label from the trade. */
function tabsFor(industry: DemoIndustry): { id: Tab; label: string }[] {
  const trim = (label: string) => {
    const word = label.replace(/^Your /i, "");
    return word.charAt(0).toUpperCase() + word.slice(1);
  };
  return [
    { id: "project", label: trim(industry.portalName) },
    { id: "estimate", label: "Estimate" },
    { id: "invoice", label: "Invoice" },
    { id: "files", label: trim(industry.filesLabel) },
    { id: "messages", label: "Messages" },
  ];
}

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(n);

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
  const [industryId, setIndustryId] = useState(INDUSTRIES[0].id);
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

  const industry =
    INDUSTRIES.find((i) => i.id === industryId) ?? INDUSTRIES[0];
  const total = industryTotal(industry);
  const deposit = Math.round(total * 0.3);
  const stages = industry.stages;

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
    ping(`Deposit paid — ${industry.portalName.toLowerCase()} opened, receipt emailed`);
    setTab("project");
  }

  function payBalance() {
    setInvoice("paid");
    ping("Paid in full — receipt emailed");
  }

  /** Switching trade resets the walkthrough — half-finished states confuse. */
  function chooseIndustry(id: string) {
    setIndustryId(id);
    setEstimate("sent");
    setInvoice("none");
    setStage(0);
    setTab("estimate");
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
      url={`yourbusiness.com.au/${role === "client" ? "portal" : "admin"}`}
      label="Try it — a client portal"
      footnote={
        <>
          Click through it — accepting the estimate raises the invoice, and
          paying the deposit opens the job. Switch sides to see the same job
          from the business&rsquo;s desk. Pick a trade above; it&rsquo;s the
          same system either way.
        </>
      }
    >
      <div className={styles.portal}>
        {/* Same portal, different trade — it isn't a creative-industry tool. */}
        <div className={styles.industryBar}>
          <span className={styles.industryLabel}>Show me a</span>
          {INDUSTRIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.industryBtn} ${
                industryId === item.id ? styles.industryOn : ""
              }`}
              onClick={() => chooseIndustry(item.id)}
              aria-pressed={industryId === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>

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
            industry={industry}
            total={total}
            deposit={deposit}
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
            industry={industry}
            total={total}
            deposit={deposit}
            estimate={estimate}
            invoice={invoice}
            stage={stage}
            stageBadge={stageBadge}
            onStage={(next) => {
              setStage(next);
              ping(`Moved to ${stages[next]} — client emailed`);
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
  industry,
  total,
  deposit,
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
  industry: DemoIndustry;
  total: number;
  deposit: number;
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
          <span className={styles.portalEyebrow}>{industry.portalName}</span>
          <h4 className={styles.portalTitle}>{industry.project}</h4>
        </div>
        <span className={styles.avatar} aria-hidden="true">
          {industry.clientInitials}
        </span>
      </div>

      <nav className={styles.tabs} role="tablist" aria-label="Portal sections">
        {tabsFor(industry).map((item) => (
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
              {industry.stages.map((name, i) => (
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
                ? `${industry.portalName} opens as soon as the deposit is paid.`
                : `Currently ${industry.stages[stage].toLowerCase()}. You'll get an email each time this moves.`}
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
              {industry.lineItems.map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <span>{money(item.amount)}</span>
                </li>
              ))}
            </ul>
            <div className={styles.lineTotal}>
              <span>Total</span>
              <strong>{money(total)}</strong>
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
                  <strong className={styles.payValue}>{money(deposit)}</strong>
                </div>
                <div>
                  <span className={styles.payLabel}>Balance on delivery</span>
                  <strong className={styles.payValue}>
                    {money(total - deposit)}
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
                    Pay deposit — {money(deposit)}
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
                    Pay balance — {money(total - deposit)}
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
              {industry.files.map((file) => (
                <li key={file.name}>
                  <span className={styles.fileKind}>{file.kind}</span>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileSize}>{file.size}</span>
                  <span className={styles.fileGet}>Download</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>{industry.filesEmpty}</p>
          )
        ) : null}

        {tab === "messages" ? (
          <div className={styles.thread}>
            {industry.thread.map((msg, i) => (
              <div
                key={i}
                className={`${styles.msg} ${msg.who === "you" ? styles.msgMine : ""}`}
              >
                <span className={styles.msgWho}>
                  {msg.who === "you" ? "You" : industry.studio}
                </span>
                <p>{msg.text}</p>
              </div>
            ))}
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
  industry,
  total,
  deposit,
  estimate,
  invoice,
  stage,
  stageBadge,
  onStage,
}: {
  industry: DemoIndustry;
  total: number;
  deposit: number;
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
          ? `${money(total)} · accepted`
          : estimate === "declined"
            ? "Declined"
            : `${money(total)} · awaiting reply`,
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
              ? `${money(deposit)} of ${money(total)}`
              : "Paid in full",
      done: invoice === "paid",
    },
    {
      label: "Progress",
      detail: invoice === "none" ? "Not started" : industry.stages[stage],
      done: stage >= industry.stages.length - 1,
    },
  ];

  return (
    <>
      <div className={styles.portalHead}>
        <div>
          <span className={styles.portalEyebrow}>{industry.studio} · Jobs</span>
          <h4 className={styles.portalTitle}>{industry.project}</h4>
        </div>
        <span className="jm-badge jm-badge--teal">{stageBadge}</span>
      </div>

      <div className={styles.panel}>
        <p className={styles.rowMetaLine}>
          {industry.client} · {industry.serviceType}
        </p>

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
          <span className={styles.payLabel}>Move the job along</span>
          <div className={styles.stageBtns}>
            {industry.stages.map((name, i) => (
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
              ? "The job opens once the deposit clears — accept the estimate on the client side first."
              : "Every move emails the client and updates their progress bar. Nothing to write by hand."}
          </p>
        </div>
      </div>
    </>
  );
}
