"use client";

import { useState } from "react";

import { useToast } from "./Toast";
import styles from "./Forms.module.css";

/** Short "just say hello" form — the long version is QuoteForm. */
export default function ContactForm() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    setSubmitting(true);
    setErrors({});

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (!response.ok) {
        if (result.errors) {
          setErrors(result.errors);
          toast("Please check the highlighted fields.", "error");
        } else {
          toast(result.error ?? "Something went wrong.", "error");
        }
        return;
      }

      toast("Message sent — I'll be in touch soon.");
      form.reset();
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="c-company">Company</label>
        <input id="c-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="jm-field">
        <label className="jm-label" htmlFor="c-name">
          Name
        </label>
        <input
          id="c-name"
          name="name"
          className="jm-input"
          placeholder="Jane Smith"
          autoComplete="name"
          required
        />
        {errors.name ? <p className="jm-field-error">{errors.name}</p> : null}
      </div>

      <div className="jm-field">
        <label className="jm-label" htmlFor="c-email">
          Email
        </label>
        <input
          id="c-email"
          name="email"
          type="email"
          className="jm-input"
          placeholder="jane@example.com"
          autoComplete="email"
          required
        />
        {errors.email ? <p className="jm-field-error">{errors.email}</p> : null}
      </div>

      <div className="jm-field">
        <label className="jm-label" htmlFor="c-message">
          Message
        </label>
        <textarea
          id="c-message"
          name="message"
          className="jm-textarea"
          rows={5}
          placeholder="Tell me about your project…"
          required
        />
        {errors.message ? (
          <p className="jm-field-error">{errors.message}</p>
        ) : null}
      </div>

      <button
        type="submit"
        className={`jm-btn-primary ${styles.submit}`}
        disabled={submitting}
      >
        {submitting ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
