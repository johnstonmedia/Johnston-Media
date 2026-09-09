"use client";

import { useEffect, useState } from "react";

import styles from "./ThemeToggle.module.css";

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "jm-theme";

/**
 * Runs before first paint to stop a flash of the wrong theme.
 *
 * Kept as a string so it can be inlined in <head>: by the time React
 * hydrates, the page has already been painted once.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})();`;

const ORDER: ThemeChoice[] = ["system", "light", "dark"];

const LABELS: Record<ThemeChoice, string> = {
  system: "Match system",
  light: "Light",
  dark: "Dark",
};

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = choice;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private browsing — the choice just won't persist.
  }
}

/**
 * Light/dark control.
 *
 * Defaults to following the visitor's system setting; the toggle is an
 * override for people who want this one site pinned either way.
 */
export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored === "light" || stored === "dark") setChoice(stored);
    setReady(true);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    setChoice(next);
    apply(next);
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={cycle}
      // Until the stored value is read, the icon would be a guess.
      aria-label={`Theme: ${LABELS[choice]}. Click to change.`}
      title={`Theme: ${LABELS[choice]}`}
      suppressHydrationWarning
    >
      <span className={styles.icon} aria-hidden="true">
        {!ready ? <AutoIcon /> : null}
        {ready && choice === "system" ? <AutoIcon /> : null}
        {ready && choice === "light" ? <SunIcon /> : null}
        {ready && choice === "dark" ? <MoonIcon /> : null}
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

/** Half-filled circle — the usual shorthand for "follow the system". */
function AutoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}
