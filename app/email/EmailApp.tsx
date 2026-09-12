"use client";

import { doc, getDoc } from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import Image from "next/image";

import AuthGate from "@/components/AuthGate";
import { getDb } from "@/lib/firebase";
import {
  atLeast,
  EMAIL_LEVEL_LABELS,
  type EmailAccess,
  type EmailLevel,
} from "@/lib/emailTypes";
import { ADMIN_ROLES, type UserProfile } from "@/lib/types";

import AccessPanel from "./AccessPanel";
import AudiencePanel from "./AudiencePanel";
import CampaignsPanel from "./CampaignsPanel";
import ContactsPanel from "./ContactsPanel";
import InboxPanel from "./InboxPanel";
import MailboxesPanel from "./MailboxesPanel";
import OverviewPanel from "./OverviewPanel";
import TemplatePanel from "./TemplatePanel";
import styles from "./email.module.css";

type Section =
  | "overview"
  | "inbox"
  | "campaigns"
  | "audiences"
  | "contacts"
  | "templates"
  | "mailboxes"
  | "access";

const NAV: {
  id: Section;
  label: string;
  icon: string;
  needs: EmailLevel;
}[] = [
  { id: "overview", label: "Overview", icon: "◈", needs: "read" },
  // The inbox covers every address, help@ included — which is why there is no
  // separate Help tab any more; two inboxes showing the same mail was worse
  // than one that can be filtered.
  { id: "inbox", label: "Inbox", icon: "✉", needs: "read" },
  { id: "campaigns", label: "Campaigns", icon: "◈", needs: "read" },
  { id: "audiences", label: "Audiences", icon: "◐", needs: "read" },
  { id: "contacts", label: "Contacts", icon: "◉", needs: "read" },
  { id: "templates", label: "Templates", icon: "◇", needs: "read" },
  // Both admin-only, and both about how the platform is set up rather than
  // about today's mail — so they sit together at the bottom of the rail.
  { id: "mailboxes", label: "Mailboxes", icon: "◍", needs: "admin" },
  { id: "access", label: "Access", icon: "⚿", needs: "admin" },
];

export default function EmailApp() {
  return (
    // useSearchParams needs a boundary, and the gate is the natural one.
    <Suspense fallback={null}>
      <AuthGate title="Email" subtitle="Sign in to open the email platform.">
        {({ profile, signOut, getToken }) => (
          <Platform profile={profile} signOut={signOut} getToken={getToken} />
        )}
      </AuthGate>
    </Suspense>
  );
}

/** Sections that can be linked to. */
const LINKABLE = new Set<Section>([
  "overview",
  "inbox",
  "campaigns",
  "audiences",
  "contacts",
  "templates",
  "mailboxes",
  "access",
]);

function Platform({
  profile,
  signOut,
  getToken,
}: {
  profile: UserProfile;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}) {
  const [access, setAccess] = useState<EmailAccess | null | "loading">(
    "loading",
  );
  const params = useSearchParams();

  /**
   * The section, the mailbox and the open conversation all live in the URL.
   *
   * Which means a conversation has an address you can send someone, bookmark,
   * or land on from a notification — rather than "open the platform, click
   * Inbox, find the thread". It's what makes a link to a reply actually take
   * you to the reply.
   */
  const linked = params.get("section") as Section | null;
  const [section, setSection] = useState<Section>(
    linked && LINKABLE.has(linked) ? linked : "inbox",
  );
  const [unread, setUnread] = useState(0);

  /**
   * The sidebar has three states, not two.
   *
   * On a wide screen it's pinned open or collapsed to icons, and the choice
   * sticks — someone who works in the inbox all day wants the width back, and
   * shouldn't have to say so every morning. On a phone it's a drawer that
   * starts shut, because there is no room for it to be anything else.
   */
  const [pinned, setPinned] = useState(true);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("jm-email-nav");
      if (saved === "collapsed") setPinned(false);
    } catch {
      // Private browsing, blocked storage — the default is fine.
    }
  }, []);

  function togglePin() {
    setPinned((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(
          "jm-email-nav",
          next ? "pinned" : "collapsed",
        );
      } catch {
        // Not worth failing the click over.
      }
      return next;
    });
  }

  /**
   * Choosing a section on a phone should also put the drawer away.
   *
   * The address bar is updated with history.replaceState rather than the Next
   * router. router.replace() is a real client navigation, and because this
   * component reads useSearchParams() it sits inside a Suspense boundary —
   * so every section click re-suspended that boundary, tore down the auth
   * gate beneath it and put the whole platform back to a loading screen that
   * only a reload recovered from. Nothing here needs a navigation: the URL is
   * a bookmark of the current state, not a route to fetch.
   */
  function choose(next: Section) {
    setSection(next);
    setDrawer(false);
    try {
      const url =
        next === "inbox"
          ? window.location.pathname
          : `${window.location.pathname}?section=${next}`;
      window.history.replaceState(null, "", url);
    } catch {
      // An address bar that doesn't follow along is cosmetic; the section
      // still changed.
    }
  }

  /**
   * Site admins get full access implicitly — they can already grant it to
   * themselves, so requiring the record would be ceremony. Everyone else is
   * exactly what their emailAccess document says.
   */
  const load = useCallback(async () => {
    if (ADMIN_ROLES.includes(profile.role)) {
      setAccess({
        uid: profile.id,
        email: profile.email,
        name: profile.name,
        level: "admin",
        allowedFrom: [],
        canBroadcast: true,
        updatedAt: "",
        updatedBy: "site-admin",
      });
      return;
    }

    try {
      const snap = await getDoc(doc(getDb(), "emailAccess", profile.id));
      setAccess(
        snap.exists() ? ({ uid: snap.id, ...snap.data() } as EmailAccess) : null,
      );
    } catch (err) {
      console.error("[email] access lookup failed:", err);
      setAccess(null);
    }
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  if (access === "loading") {
    return <div className={styles.gate}>Checking your access…</div>;
  }

  if (!access || access.level === "none") {
    return (
      <div className={styles.gate}>
        <div style={{ maxWidth: "34rem" }}>
          <h1 className={styles.title}>No access yet</h1>
          <p className={styles.sub} style={{ margin: "0.75rem auto 1.5rem" }}>
            Your account is signed in as <strong>{profile.email}</strong>, but it
            hasn&rsquo;t been given access to the email platform. Ask an
            administrator to add you.
          </p>
          <button type="button" className="jm-btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const visible = NAV.filter((item) => atLeast(access.level, item.needs));

  return (
    <div
      className={styles.shell}
      // Only the inbox is a fixed-height, scroll-inside app. Every other
      // section is an ordinary page and has to scroll normally — on a phone
      // the shell is what owns the height, so it has to know which it is.
      data-full={section === "inbox" ? "true" : "false"}
      data-pinned={pinned ? "true" : "false"}
      data-drawer={drawer ? "open" : "shut"}
    >
      {/* Phone header. The sidebar is a drawer at this size, so it needs
          something to open it and somewhere for the section name to live. */}
      <header className={styles.mobileBar}>
        <button
          type="button"
          className={styles.hamburger}
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          aria-expanded={drawer}
        >
          <span />
          <span />
          <span />
        </button>
        <span className={styles.mobileTitle}>
          {visible.find((item) => item.id === section)?.label ?? "Email"}
        </span>
        {unread > 0 ? (
          <span className={styles.navCount}>{unread}</span>
        ) : null}
      </header>

      {/* Tapping away closes the drawer, which is what everyone expects. */}
      <div
        className={styles.scrim}
        onClick={() => setDrawer(false)}
        aria-hidden="true"
      />

      <aside className={styles.side}>
        <div className={styles.brand}>
          <Image
            src="/logo.png"
            alt="Johnston Media"
            width={170}
            height={46}
            className={styles.brandLogo}
            priority
          />
          <span className={styles.brandSub}>Email</span>

          <button
            type="button"
            className={styles.pinBtn}
            onClick={togglePin}
            aria-label={pinned ? "Collapse the menu" : "Pin the menu open"}
            title={pinned ? "Collapse the menu" : "Pin the menu open"}
          >
            {pinned ? "«" : "»"}
          </button>

          <button
            type="button"
            className={styles.drawerClose}
            onClick={() => setDrawer(false)}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <nav className={styles.nav} aria-label="Email platform">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.navItem} ${
                section === item.id ? styles.navOn : ""
              }`}
              onClick={() => choose(item.id)}
              aria-current={section === item.id}
              title={item.label}
            >
              <span className={styles.navIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span className={styles.navLabel}>{item.label}</span>
              {item.id === "inbox" && unread > 0 ? (
                <span className={styles.navCount}>{unread}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className={styles.sideFoot}>
          <strong>{access.email}</strong>
          <span className={styles.levelChip}>
            {EMAIL_LEVEL_LABELS[access.level]}
          </span>
          <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.35rem" }}>
            <a href="/admin" style={{ color: "var(--jm-blue)" }}>
              Back to admin
            </a>
            <button
              type="button"
              onClick={signOut}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--jm-slate)",
                font: "inherit",
                textAlign: "left",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* The inbox is a mail client, not a page about mail: it takes the
          whole window and scrolls inside its own panes. */}
      <main className={styles.main} data-full={section === "inbox" ? "true" : "false"}>
        {section === "overview" ? (
          <OverviewPanel access={access} onJump={setSection} />
        ) : null}
        {section === "campaigns" ? (
          <CampaignsPanel access={access} getToken={getToken} />
        ) : null}
        {section === "audiences" ? <AudiencePanel access={access} /> : null}
        {section === "contacts" ? <ContactsPanel access={access} /> : null}
        {section === "templates" ? <TemplatePanel access={access} /> : null}
        {section === "inbox" ? (
          <>
            <InboxPanel
              access={access}
              getToken={getToken}
              onCount={setUnread}
              initialThreadId={params.get("thread") ?? undefined}
              initialMailbox={params.get("mailbox") ?? undefined}
              openCompose={params.get("compose") === "1"}
            />
          </>
        ) : null}
        {section === "mailboxes" ? <MailboxesPanel /> : null}
        {section === "access" ? <AccessPanel getToken={getToken} /> : null}
      </main>
    </div>
  );
}
