"use client";

import { useState } from "react";

import { useToast } from "./Toast";
import styles from "./Forms.module.css";

const MEDIA_SERVICES = [
  "Sports Videography",
  "Sports Photography",
  "Commercial Video",
  "Commercial Photography",
  "Event Coverage",
  "Aerial / Drone",
  "Editing Only",
  "Something Else",
];

const WEB_SERVICES = [
  "Landing Page",
  "Business Website",
  "Custom Portal / Web App",
  "Booking & Invoicing Automation",
  "Redesign of an Existing Site",
  "Something Else",
];

const BUDGETS = [
  "Under $1,000",
  "$1,000 – $2,500",
  "$2,500 – $5,000",
  "$5,000 – $10,000",
  "$10,000+",
  "Not sure yet",
];

interface QuoteFormProps {
  /** Switches the service list and labels between the two sides of the business. */
  source: "media" | "web";
}

type Errors = Record<string, string>;

export default function QuoteForm({ source }: QuoteFormProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const isWeb = source === "web";
  const services = isWeb ? WEB_SERVICES : MEDIA_SERVICES;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    setSubmitting(true);
    setErrors({});

    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, source }),
      });
      const result = await response.json();

      if (!response.ok) {
        if (result.errors) {
          setErrors(result.errors);
          toast("Please check the highlighted fields.", "error");
        } else {
          toast(result.error ?? "Something went wrong. Please try again.", "error");
        }
        return;
      }

      setDone(true);
      form.reset();
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className={styles.success}>
        <div className={styles.successMark}>✓</div>
        <h3 className={styles.successTitle}>Request received.</h3>
        <p className={styles.successBody}>
          Thanks — I&apos;ve got your details and sent a confirmation to your
          inbox. I&apos;ll review everything and come back to you with a quote,
          usually within one business day.
        </p>
        <p style={{ marginTop: "1.5rem" }}>
          <button
            type="button"
            className="jm-btn-ghost jm-btn-sm"
            onClick={() => setDone(false)}
          >
            Send another request
          </button>
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      <div className={styles.row}>
        <div className="jm-field">
          <label className="jm-label" htmlFor="q-name">
            Name
          </label>
          <input
            id="q-name"
            name="name"
            className="jm-input"
            placeholder="Jane Smith"
            autoComplete="name"
            required
          />
          {errors.name ? <p className="jm-field-error">{errors.name}</p> : null}
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="q-email">
            Email
          </label>
          <input
            id="q-email"
            name="email"
            type="email"
            className="jm-input"
            placeholder="jane@example.com"
            autoComplete="email"
            required
          />
          {errors.email ? (
            <p className="jm-field-error">{errors.email}</p>
          ) : null}
        </div>
      </div>

      <div className={styles.row}>
        <div className="jm-field">
          <label className="jm-label" htmlFor="q-phone">
            Phone <span style={{ textTransform: "none" }}>(optional)</span>
          </label>
          <input
            id="q-phone"
            name="phone"
            type="tel"
            className="jm-input"
            placeholder="+61 400 000 000"
            autoComplete="tel"
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="q-service">
            {isWeb ? "What do you need?" : "Service"}
          </label>
          <select
            id="q-service"
            name="serviceType"
            className="jm-select"
            defaultValue=""
            required
          >
            <option value="" disabled>
              Choose one…
            </option>
            {services.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
          {errors.serviceType ? (
            <p className="jm-field-error">{errors.serviceType}</p>
          ) : null}
        </div>
      </div>

      <div className="jm-field">
        <label className="jm-label" htmlFor="q-project">
          {isWeb ? "Project / business name" : "Project name"}
        </label>
        <input
          id="q-project"
          name="projectName"
          className="jm-input"
          placeholder={
            isWeb ? "Riverside Dental — new site" : "2026 Season Highlights"
          }
          required
        />
        {errors.projectName ? (
          <p className="jm-field-error">{errors.projectName}</p>
        ) : null}
      </div>

      <div className={styles.row}>
        <div className="jm-field">
          <label className="jm-label" htmlFor="q-date">
            {isWeb ? "Ideal launch date" : "Shoot date"}
          </label>
          <input
            id="q-date"
            name="date"
            type="date"
            className="jm-input"
          />
        </div>

        <div className="jm-field">
          <label className="jm-label" htmlFor="q-budget">
            Budget
          </label>
          <select
            id="q-budget"
            name="budget"
            className="jm-select"
            defaultValue=""
          >
            <option value="">Prefer not to say</option>
            {BUDGETS.map((budget) => (
              <option key={budget} value={budget}>
                {budget}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!isWeb ? (
        <div className="jm-field">
          <label className="jm-label" htmlFor="q-location">
            Location
          </label>
          <input
            id="q-location"
            name="location"
            className="jm-input"
            placeholder="Sydney, NSW"
          />
        </div>
      ) : null}

      <div className="jm-field">
        <label className="jm-label" htmlFor="q-details">
          Tell me about it
        </label>
        <textarea
          id="q-details"
          name="details"
          className="jm-textarea"
          rows={5}
          placeholder={
            isWeb
              ? "What does the site need to do? Any examples you love, pages you need, or systems it should connect to…"
              : "What's the story, who's involved, and what do you want to walk away with…"
          }
        />
      </div>

      <div className={styles.submitRow}>
        <button
          type="submit"
          className={`jm-btn-primary ${styles.submit}`}
          disabled={submitting}
        >
          {submitting ? "Sending…" : "Request a Quote"}
        </button>
        <p className={styles.note}>
          You&apos;ll get an instant confirmation email, then a personal quote —
          usually within one business day. No obligation.
        </p>
      </div>
    </form>
  );
}
