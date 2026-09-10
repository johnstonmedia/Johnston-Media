"use client";

import { collection, getCountFromServer, getDocs, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";

import { getDb } from "@/lib/firebase";
import { atLeast, type EmailAccess } from "@/lib/emailTypes";

import styles from "./email.module.css";

interface Counts {
  contacts: number;
  subscribed: number;
  campaigns: number;
  sentThisYear: number;
  openHelp: number;
}

/**
 * The first screen: what state everything is in, and what needs a person.
 *
 * Counts come from Firestore's aggregate API rather than reading every
 * document — a contact list is exactly the collection you don't want to pull
 * down in full just to show a number on a dashboard.
 */
export default function OverviewPanel({
  access,
  onJump,
}: {
  access: EmailAccess;
  onJump: (section: "campaigns" | "contacts" | "inbox") => void;
}) {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const db = getDb();
        const contacts = collection(db, "contacts");
        const campaigns = collection(db, "campaigns");

        const [all, subs, camps, sent, help] = await Promise.all([
          getCountFromServer(contacts),
          getCountFromServer(query(contacts, where("subscribed", "==", true))),
          getCountFromServer(campaigns),
          getCountFromServer(query(campaigns, where("status", "==", "Sent"))),
          getCountFromServer(
            query(collection(db, "helpThreads"), where("status", "==", "Open")),
          ),
        ]);

        if (cancelled) return;
        setCounts({
          contacts: all.data().count,
          subscribed: subs.data().count,
          campaigns: camps.data().count,
          sentThisYear: sent.data().count,
          openHelp: help.data().count,
        });
      } catch (err) {
        console.warn("[email] overview counts failed:", err);
        if (!cancelled) {
          setCounts({
            contacts: 0,
            subscribed: 0,
            campaigns: 0,
            sentThisYear: 0,
            openHelp: 0,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const unsubscribed = counts ? counts.contacts - counts.subscribed : 0;

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Overview</h1>
          <p className={styles.sub}>
            Everything that goes out under your name, and everything that comes
            back to help@ — in one place.
          </p>
        </div>
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Subscribed</span>
          <span className={styles.statValue}>
            {counts ? counts.subscribed.toLocaleString("en-AU") : "—"}
          </span>
          <span className={styles.statNote}>
            {unsubscribed > 0
              ? `${unsubscribed.toLocaleString("en-AU")} unsubscribed`
              : "of everyone on the list"}
          </span>
        </div>

        <div className={styles.stat}>
          <span className={styles.statLabel}>Campaigns</span>
          <span className={styles.statValue}>
            {counts ? counts.campaigns.toLocaleString("en-AU") : "—"}
          </span>
          <span className={styles.statNote}>
            {counts ? `${counts.sentThisYear} sent` : "drafts and sent"}
          </span>
        </div>

        <div className={styles.stat}>
          <span className={styles.statLabel}>Open help</span>
          <span className={styles.statValue}>
            {counts ? counts.openHelp.toLocaleString("en-AU") : "—"}
          </span>
          <span className={styles.statNote}>waiting on a reply</span>
        </div>

        <div className={styles.stat}>
          <span className={styles.statLabel}>Your limit</span>
          <span className={styles.statValue}>
            {access.level === "admin"
              ? "∞"
              : (access.maxRecipients ?? 500).toLocaleString("en-AU")}
          </span>
          <span className={styles.statNote}>recipients per send</span>
        </div>
      </div>

      <div className={styles.warn}>
        <strong>Before you send anything commercial:</strong> Australian law
        requires every marketing email to identify who sent it and carry a
        working unsubscribe link. The platform adds the unsubscribe header for
        you and refuses to send a campaign whose content is missing{" "}
        <code>{"{{unsubscribe_url}}"}</code> — but the sender details in your
        template are yours to keep accurate.
      </div>

      <div className={styles.list}>
        {counts && counts.openHelp > 0 ? (
          <article className={`${styles.row} ${styles.rowUnread}`}>
            <div className={styles.rowMain}>
              <h3 className={styles.rowTitle}>
                {counts.openHelp} open help {counts.openHelp === 1 ? "thread" : "threads"}
              </h3>
              <p className={styles.rowMeta}>
                Someone wrote to help@ and hasn&rsquo;t had an answer.
              </p>
            </div>
            <div className={styles.rowActions}>
              <button
                type="button"
                className="jm-btn-primary jm-btn-sm"
                onClick={() => onJump("inbox")}
              >
                Open the inbox
              </button>
            </div>
          </article>
        ) : null}

        {counts && counts.subscribed === 0 ? (
          <article className={styles.row}>
            <div className={styles.rowMain}>
              <h3 className={styles.rowTitle}>No contacts yet</h3>
              <p className={styles.rowMeta}>
                Add people by hand or paste a list in — a campaign needs someone
                to go to.
              </p>
            </div>
            <div className={styles.rowActions}>
              <button
                type="button"
                className="jm-btn-ghost jm-btn-sm"
                onClick={() => onJump("contacts")}
              >
                Add contacts
              </button>
            </div>
          </article>
        ) : null}

        {atLeast(access.level, "draft") ? (
          <article className={styles.row}>
            <div className={styles.rowMain}>
              <h3 className={styles.rowTitle}>Write a campaign</h3>
              <p className={styles.rowMeta}>
                Start a draft, preview it against your template, and send
                yourself a test before it goes anywhere near the list.
              </p>
            </div>
            <div className={styles.rowActions}>
              <button
                type="button"
                className="jm-btn-ghost jm-btn-sm"
                onClick={() => onJump("campaigns")}
              >
                New campaign
              </button>
            </div>
          </article>
        ) : null}
      </div>
    </>
  );
}
