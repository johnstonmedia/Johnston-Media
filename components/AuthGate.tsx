"use client";

import type { ReactNode } from "react";

import { useAuth } from "@/lib/useAuth";
import { ADMIN_ROLES, type UserProfile } from "@/lib/types";

import styles from "./AuthGate.module.css";

interface AuthGateProps {
  title: string;
  subtitle: string;
  /** Require an admin-level role, not just a signed-in user. */
  adminOnly?: boolean;
  children: (auth: {
    profile: UserProfile;
    signOut: () => Promise<void>;
    getToken: () => Promise<string | null>;
  }) => ReactNode;
}

/**
 * Shared sign-in wall for /portal and /admin.
 *
 * Firestore rules are the real enforcement — this is the UI layer that keeps
 * people out of screens they can't use and explains why.
 */
export default function AuthGate({
  title,
  subtitle,
  adminOnly = false,
  children,
}: AuthGateProps) {
  const { user, profile, loading, error, signIn, signOut, getToken } = useAuth();

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span>Loading</span>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className={styles.screen}>
        <div className={`jm-flare ${styles.flare}`} aria-hidden="true" />
        <div className="jm-grain" aria-hidden="true" />
        <div className={styles.card}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.sub}>{subtitle}</p>

          <button
            type="button"
            className={styles.googleBtn}
            onClick={signIn}
            disabled={Boolean(error) && !user}
          >
            <GoogleMark />
            Continue with Google
          </button>

          {error ? <p className={styles.error}>{error}</p> : null}

          <p className={styles.note}>
            First time here? Signing in creates your account automatically.
          </p>
        </div>
      </div>
    );
  }

  if (profile.blocked) {
    return (
      <div className={styles.screen}>
        <div className={styles.denied}>
          <div className={styles.deniedIcon}>!</div>
          <h1 className={styles.title}>Account suspended</h1>
          <p className={styles.sub}>
            This account no longer has access. If you think that&apos;s a
            mistake, get in touch and we&apos;ll sort it out.
          </p>
          <button type="button" className="jm-btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (adminOnly && !ADMIN_ROLES.includes(profile.role)) {
    return (
      <div className={styles.screen}>
        <div className={styles.denied}>
          <div className={styles.deniedIcon}>×</div>
          <h1 className={styles.title}>Not your floor</h1>
          <p className={styles.sub}>
            You&apos;re signed in as {profile.email}, which doesn&apos;t have
            admin access. Head to the client portal instead.
          </p>
          <a href="/portal" className="jm-btn-primary">
            Go to client portal
          </a>
          <p style={{ marginTop: "1rem" }}>
            <button type="button" className="jm-btn-ghost jm-btn-sm" onClick={signOut}>
              Sign out
            </button>
          </p>
        </div>
      </div>
    );
  }

  return <>{children({ profile, signOut, getToken })}</>;
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
