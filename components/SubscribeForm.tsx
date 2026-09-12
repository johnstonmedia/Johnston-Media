"use client";

import { useState } from "react";

import styles from "./SubscribeForm.module.css";

/**
 * The public way onto the mailing list.
 *
 * Until this existed, contacts only arrived through a quote request or by
 * hand — which meant the campaign tool had an audience nobody could join.
 *
 * The form never claims someone is subscribed. It says a confirmation is on
 * its way, because that is all that has happened: the list only gains a
 * person when they click the link in it. Same message either way, including
 * for an address already on the list — anything else turns this into a way
 * to find out who has signed up.
 */
export default function SubscribeForm({
  source = "website",
  heading = "Occasional updates",
  blurb = "New work, the odd behind-the-scenes, and nothing else. A few times a year at most.",
}: {
  source?: string;
  heading?: string;
  blurb?: string;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;

    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/email/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, company, source }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setError(result.error ?? "That didn't go through. Try again?");
        setState("error");
        return;
      }
      setState("sent");
    } catch {
      setError("Network error — try again in a moment.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className={styles.wrap}>
        <h3 className={styles.heading}>Check your inbox</h3>
        <p className={styles.blurb}>
          There&rsquo;s a confirmation link on its way to{" "}
          <strong>{email}</strong>. You&rsquo;re not on the list until you
          click it — that&rsquo;s deliberate, so nobody can sign you up.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h3 className={styles.heading}>{heading}</h3>
      <p className={styles.blurb}>{blurb}</p>

      <form className={styles.form} onSubmit={submit}>
        <label className="jm-sr-only" htmlFor="sub-name">
          Your name
        </label>
        <input
          id="sub-name"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          autoComplete="name"
        />

        <label className="jm-sr-only" htmlFor="sub-email">
          Email address
        </label>
        <input
          id="sub-email"
          className={styles.input}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />

        {/* Left empty by people, filled in by bots. */}
        <input
          className={styles.honeypot}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        <button
          type="submit"
          className={styles.button}
          disabled={state === "sending"}
        >
          {state === "sending" ? "Sending…" : "Subscribe"}
        </button>
      </form>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <p className={styles.small}>
        A confirmation email comes first. Unsubscribe from any email, any time.
      </p>
    </div>
  );
}
