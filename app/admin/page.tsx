"use client";

import { useState } from "react";

import AuthGate from "@/components/AuthGate";
import type { UserProfile } from "@/lib/types";

import styles from "./admin.module.css";
import MessagesPanel from "./MessagesPanel";
import ProjectsPanel from "./ProjectsPanel";
import QuotesPanel from "./QuotesPanel";
import UsersPanel from "./UsersPanel";

type Tab = "quotes" | "projects" | "clients" | "messages";

const TABS: { id: Tab; label: string }[] = [
  { id: "quotes", label: "Quotes" },
  { id: "projects", label: "Projects" },
  { id: "clients", label: "Clients" },
  { id: "messages", label: "Messages" },
];

export default function AdminPage() {
  return (
    <AuthGate
      adminOnly
      title="Admin"
      subtitle="Sign in with an account that has admin access."
    >
      {({ profile, signOut, getToken }) => (
        <AdminDashboard
          profile={profile}
          signOut={signOut}
          getToken={getToken}
        />
      )}
    </AuthGate>
  );
}

function AdminDashboard({
  profile,
  signOut,
  getToken,
}: {
  profile: UserProfile;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}) {
  const [tab, setTab] = useState<Tab>("quotes");
  const [counts, setCounts] = useState<Partial<Record<Tab, number>>>({});

  const setCount = (key: Tab) => (n: number) =>
    setCounts((prev) => (prev[key] === n ? prev : { ...prev, [key]: n }));

  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Admin</h1>
            <div className={styles.subtitle}>
              <span className="jm-badge jm-badge--copper">{profile.role}</span>
              <span>{profile.email}</span>
            </div>
          </div>
          <div className={styles.rowActions}>
            <a href="/portal" className="jm-btn-ghost jm-btn-sm">
              Client view
            </a>
            <button
              type="button"
              className="jm-btn-ghost jm-btn-sm"
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Admin sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.tab} ${
                tab === item.id ? styles.tabActive : ""
              }`}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id}
            >
              {item.label}
              {counts[item.id] !== undefined ? (
                <span className={styles.tabCount}>{counts[item.id]}</span>
              ) : null}
            </button>
          ))}
        </nav>

        {/* Panels stay mounted so switching tabs doesn't refetch everything. */}
        <div hidden={tab !== "quotes"}>
          <QuotesPanel getToken={getToken} onCount={setCount("quotes")} />
        </div>
        <div hidden={tab !== "projects"}>
          <ProjectsPanel getToken={getToken} onCount={setCount("projects")} />
        </div>
        <div hidden={tab !== "clients"}>
          <UsersPanel profile={profile} onCount={setCount("clients")} />
        </div>
        <div hidden={tab !== "messages"}>
          <MessagesPanel onCount={setCount("messages")} />
        </div>
      </div>
    </div>
  );
}
