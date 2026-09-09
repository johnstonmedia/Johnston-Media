"use client";

import { doc, getDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

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
import HelpPanel from "./HelpPanel";
import OverviewPanel from "./OverviewPanel";
import TemplatePanel from "./TemplatePanel";
import styles from "./email.module.css";

type Section =
  | "overview"
  | "campaigns"
  | "audiences"
  | "contacts"
  | "templates"
  | "help"
  | "access";

const NAV: {
  id: Section;
  label: string;
  icon: string;
  needs: EmailLevel;
}[] = [
  { id: "overview", label: "Overview", icon: "◈", needs: "read" },
  { id: "campaigns", label: "Campaigns", icon: "✉", needs: "read" },
  { id: "audiences", label: "Audiences", icon: "◐", needs: "read" },
  { id: "contacts", label: "Contacts", icon: "◉", needs: "read" },
  { id: "templates", label: "Templates", icon: "◇", needs: "read" },
  { id: "help", label: "Help inbox", icon: "◍", needs: "read" },
  { id: "access", label: "Access", icon: "⚿", needs: "admin" },
];

export default function EmailApp() {
  return (
    <AuthGate
      title="Email"
      subtitle="Sign in to open the email platform."
    >
      {({ profile, signOut, getToken }) => (
        <Platform profile={profile} signOut={signOut} getToken={getToken} />
      )}
    </AuthGate>
  );
}

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
  const [section, setSection] = useState<Section>("overview");
  const [helpCount, setHelpCount] = useState(0);

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
    <div className={styles.shell}>
      <aside className={styles.side}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            JM
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandTitle}>Email</span>
            <span className={styles.brandSub}>Johnston Media</span>
          </span>
        </div>

        <nav className={styles.nav} aria-label="Email platform">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.navItem} ${
                section === item.id ? styles.navOn : ""
              }`}
              onClick={() => setSection(item.id)}
              aria-current={section === item.id}
            >
              <span className={styles.navIcon} aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
              {item.id === "help" && helpCount > 0 ? (
                <span className={styles.navCount}>{helpCount}</span>
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

      <main className={styles.main}>
        {section === "overview" ? (
          <OverviewPanel access={access} onJump={setSection} />
        ) : null}
        {section === "campaigns" ? (
          <CampaignsPanel access={access} getToken={getToken} />
        ) : null}
        {section === "audiences" ? <AudiencePanel access={access} /> : null}
        {section === "contacts" ? <ContactsPanel access={access} /> : null}
        {section === "templates" ? <TemplatePanel access={access} /> : null}
        {section === "help" ? (
          <HelpPanel
            access={access}
            getToken={getToken}
            onCount={setHelpCount}
          />
        ) : null}
        {section === "access" ? <AccessPanel getToken={getToken} /> : null}
      </main>
    </div>
  );
}
