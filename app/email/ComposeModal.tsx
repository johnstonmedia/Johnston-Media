"use client";

import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
import { getDb } from "@/lib/firebase";
import {
  TEMPLATE_EXTRAS,
  type EmailAccess,
  type EmailTemplate,
  type Mailbox,
  type TemplateExtraKey,
} from "@/lib/emailTypes";

import styles from "./email.module.css";

interface ComposeModalProps {
  access: EmailAccess;
  mailboxes: Mailbox[];
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSent: () => void;
  /** Pre-fill, for "write to this person" from elsewhere. */
  initialTo?: string;
  initialSubject?: string;
}

/**
 * Writing a new email.
 *
 * Deliberately not the campaign composer: this is one message to one person,
 * the thing you actually do most days. It can still wrap itself in a template,
 * which is the point — sending a quote to a single client should look like the
 * quote template, not like a bare paragraph.
 */
export default function ComposeModal({
  access,
  mailboxes,
  getToken,
  onClose,
  onSent,
  initialTo = "",
  initialSubject = "",
}: ComposeModalProps) {
  const { toast } = useToast();

  /** Addresses this person is allowed to send as. */
  const allowed =
    access.level === "admin"
      ? mailboxes.map((m) => m.address)
      : access.allowedFrom;

  // Their own address first — the common case should take no thought.
  const [from, setFrom] = useState(
    access.primaryFrom && allowed.includes(access.primaryFrom)
      ? access.primaryFrom
      : (allowed[0] ?? ""),
  );
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [sending, setSending] = useState(false);

  // Banner fields — only meaningful once a template is chosen.
  const [eyebrow, setEyebrow] = useState("");
  const [headline, setHeadline] = useState("");
  const [lead, setLead] = useState("");
  const [primaryLabel, setPrimaryLabel] = useState("");
  const [primaryUrl, setPrimaryUrl] = useState("");
  const [footerNote, setFooterNote] = useState("");

  /**
   * The shoot-specific slots. Kept as one map rather than seven useStates
   * because they're offered as a group and sent as a group.
   */
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(getDb(), "emailTemplates"));
        setTemplates(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EmailTemplate),
        );
      } catch {
        // A template list that won't load shouldn't stop a plain email.
      }
    })();
  }, []);

  async function send() {
    if (sending) return;

    if (!from) {
      toast("You have no addresses you're allowed to send from.", "error");
      return;
    }
    if (!to.trim() || !subject.trim() || !message.trim()) {
      toast("Needs a recipient, a subject and a message.", "error");
      return;
    }

    setSending(true);
    setFailure(null);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }

      const response = await fetch("/api/email/compose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          from,
          // Commas or spaces, whichever they typed.
          to: to.split(/[,\s]+/).map((a) => a.trim()).filter(Boolean),
          subject,
          message,
          templateId,
          eyebrow,
          headline,
          lead,
          primaryLabel,
          primaryUrl,
          footerNote,
          ...extras,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        const detail =
          result.error ?? result.errors?.[0] ?? "The email didn't send.";
        // A toast is gone in four seconds, and the provider's reason for
        // refusing a send is the one thing worth reading twice — so it also
        // stays on the form until the next attempt.
        setFailure(detail);
        toast(detail, "error");
        return;
      }
      setFailure(null);

      toast(
        result.failed > 0
          ? `Sent to ${result.sent}, ${result.failed} failed.`
          : `Sent to ${result.sent === 1 ? to.trim() : `${result.sent} people`}.`,
      );
      onSent();
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setSending(false);
    }
  }

  const usingTemplate = Boolean(templateId);

  /**
   * Only offer a field the chosen template has somewhere to put. Asking for a
   * shoot date on a template with no slot for it is noise, and a slot left
   * unfilled is blanked server-side rather than sent as a visible {{TOKEN}}.
   */
  const chosen = templates.find((t) => t.id === templateId);
  const wantedExtras = chosen
    ? TEMPLATE_EXTRAS.filter((extra) =>
        new RegExp(`\\{\\{\\s*${extra.token}\\s*\\}\\}`, "i").test(
          chosen.html,
        ),
      )
    : [];

  return (
    <div
      className="jm-modal-overlay jm-open"
      role="dialog"
      aria-modal="true"
      aria-label="New email"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      <div className="jm-modal" style={{ maxWidth: 640 }}>
        <div className="jm-modal-header">
          <h2 className="jm-modal-title">New email</h2>
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

        {allowed.length === 0 ? (
          <p className={styles.warn}>
            You don&rsquo;t have any addresses on your send list, so there&rsquo;s
            nothing to send from. An admin can add one under Access.
          </p>
        ) : null}

        <div className={styles.field2}>
          <div className="jm-field">
            <label className="jm-label" htmlFor="co-from">
              From
            </label>
            <select
              id="co-from"
              className="jm-select"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            >
              {allowed.map((address) => (
                <option key={address} value={address}>
                  {address}
                </option>
              ))}
            </select>
          </div>

          <div className="jm-field">
            <label className="jm-label" htmlFor="co-template">
              Template
            </label>
            <select
              id="co-template"
              className="jm-select"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">Plain email — no template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="co-to">
            To
          </label>
          <input
            id="co-to"
            className="jm-input"
            value={to}
            placeholder="someone@example.com — or several, separated by commas"
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="co-subject">
            Subject
          </label>
          <input
            id="co-subject"
            className="jm-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {usingTemplate ? (
          <>
            <div className={styles.field2}>
              <div className="jm-field">
                <label className="jm-label" htmlFor="co-eyebrow">
                  Eyebrow
                </label>
                <input
                  id="co-eyebrow"
                  className="jm-input"
                  value={eyebrow}
                  placeholder="Quote enclosed"
                  onChange={(e) => setEyebrow(e.target.value)}
                />
              </div>
              <div className="jm-field">
                <label className="jm-label" htmlFor="co-headline">
                  Headline
                </label>
                <input
                  id="co-headline"
                  className="jm-input"
                  value={headline}
                  placeholder="Defaults to the subject"
                  onChange={(e) => setHeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="jm-field">
              <label className="jm-label" htmlFor="co-lead">
                Lead paragraph
              </label>
              <input
                id="co-lead"
                className="jm-input"
                value={lead}
                placeholder="The line in the dark banner, under the headline"
                onChange={(e) => setLead(e.target.value)}
              />
            </div>

            <div className={styles.field2}>
              <div className="jm-field">
                <label className="jm-label" htmlFor="co-cta">
                  Button text
                </label>
                <input
                  id="co-cta"
                  className="jm-input"
                  value={primaryLabel}
                  placeholder="Accept quote"
                  onChange={(e) => setPrimaryLabel(e.target.value)}
                />
              </div>
              <div className="jm-field">
                <label className="jm-label" htmlFor="co-cta-url">
                  Button link
                </label>
                <input
                  id="co-cta-url"
                  className="jm-input"
                  type="url"
                  value={primaryUrl}
                  placeholder="https://…"
                  onChange={(e) => setPrimaryUrl(e.target.value)}
                />
              </div>
            </div>
          </>
        ) : null}

        <div className="jm-field">
          <label className="jm-label" htmlFor="co-message">
            Message
          </label>
          <textarea
            id="co-message"
            className="jm-textarea"
            rows={usingTemplate ? 6 : 10}
            value={message}
            placeholder="Write it the way you'd say it. Blank lines start new paragraphs."
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {usingTemplate ? (
          <div className="jm-field">
            <label className="jm-label" htmlFor="co-footer">
              Footer note
            </label>
            <input
              id="co-footer"
              className="jm-input"
              value={footerNote}
              placeholder="Reply to this and it comes straight to me."
              onChange={(e) => setFooterNote(e.target.value)}
            />
          </div>
        ) : null}

        {wantedExtras.length ? (
          <>
            <p className={styles.rowMeta}>
              This template also asks for:
            </p>
            {wantedExtras.map((extra) => (
              <div className="jm-field" key={extra.key}>
                <label className="jm-label" htmlFor={`co-${extra.key}`}>
                  {extra.label}
                </label>
                <input
                  id={`co-${extra.key}`}
                  className="jm-input"
                  value={extras[extra.key] ?? ""}
                  onChange={(e) =>
                    setExtras((prev) => ({
                      ...prev,
                      [extra.key satisfies TemplateExtraKey]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </>
        ) : null}

        {failure ? (
          <div className={styles.warn} role="alert">
            <strong>The send was refused.</strong> {failure}
          </div>
        ) : null}

        <p className={styles.rowMeta}>
          This is ordinary correspondence, so it carries no unsubscribe link.
          For anything going to a list, use Campaigns — that&rsquo;s where the
          marketing rules are enforced.
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className="jm-btn-primary"
            onClick={send}
            disabled={sending || allowed.length === 0}
          >
            {sending ? "Sending…" : "Send"}
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
