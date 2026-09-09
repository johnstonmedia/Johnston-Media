import type { ReactNode } from "react";

import styles from "./demos.module.css";

interface DemoFrameProps {
  /** Shown in the fake address bar. */
  url: string;
  /** Sits above the frame — what the visitor is looking at. */
  label?: string;
  /** Small print under the frame. */
  footnote?: ReactNode;
  children: ReactNode;
}

/**
 * Browser chrome around a live demo.
 *
 * The frame does a job beyond decoration: it tells the visitor that what
 * they're touching is a real interface, not a screenshot, and stops the demo's
 * own UI from being mistaken for part of the website around it.
 */
export default function DemoFrame({
  url,
  label,
  footnote,
  children,
}: DemoFrameProps) {
  return (
    <div className={styles.frameWrap}>
      {label ? <span className={styles.frameLabel}>{label}</span> : null}

      <div className={styles.frame}>
        <div className={styles.chrome} aria-hidden="true">
          <span className={styles.dots}>
            <i />
            <i />
            <i />
          </span>
          <span className={styles.address}>{url}</span>
        </div>

        <div className={styles.screen}>{children}</div>
      </div>

      {footnote ? <p className={styles.frameNote}>{footnote}</p> : null}
    </div>
  );
}
