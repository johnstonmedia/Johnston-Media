"use client";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { getDb, getFirebaseAuth, isFirebaseConfigured } from "./firebase";
import { ADMIN_ROLES, OWNER_EMAIL, type Role, type UserProfile } from "./types";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

/**
 * Firebase auth + the Firestore user profile behind it.
 *
 * On first sign-in this claims any `pendingClients/{email}` record an admin
 * pre-created, so a client Will set up in advance keeps the name, phone and
 * role he chose instead of landing as a generic Prospective.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setState({
        user: null,
        profile: null,
        loading: false,
        error: "Firebase is not configured for this deployment.",
      });
      return;
    }

    return onAuthStateChanged(getFirebaseAuth(), async (user) => {
      if (!user) {
        setState({ user: null, profile: null, loading: false, error: null });
        return;
      }

      try {
        const profile = await ensureProfile(user);
        setState({ user, profile, loading: false, error: null });
      } catch (err) {
        console.error("[auth] profile load failed:", err);
        setState({
          user,
          profile: null,
          loading: false,
          error: "Could not load your profile. Please try again.",
        });
      }
    });
  }, []);

  const signIn = useCallback(async () => {
    try {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Closing the popup isn't an error worth surfacing.
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return;
      }
      setState((prev) => ({ ...prev, error: "Sign-in failed. Please try again." }));
    }
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(getFirebaseAuth());
  }, []);

  /** Fresh ID token for calls to our own API routes. */
  const getToken = useCallback(async () => {
    const current = getFirebaseAuth().currentUser;
    return current ? current.getIdToken() : null;
  }, []);

  const role = state.profile?.role ?? null;

  return {
    ...state,
    role,
    isAdmin: role ? ADMIN_ROLES.includes(role) : false,
    signIn,
    signOut,
    getToken,
  };
}

async function ensureProfile(user: User): Promise<UserProfile> {
  const db = getDb();
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as UserProfile;
  }

  const email = (user.email ?? "").toLowerCase();
  const now = new Date().toISOString();

  // Did an admin pre-create this client?
  let pending: UserProfile | null = null;
  if (email) {
    try {
      const pendingSnap = await getDoc(doc(db, "pendingClients", email));
      if (pendingSnap.exists()) {
        pending = pendingSnap.data() as UserProfile;
      }
    } catch {
      // Rules may block the read for some users — fall through to a new profile.
    }
  }

  const role: Role = pending?.role
    ? pending.role
    : email === OWNER_EMAIL
      ? "Owner"
      : "Prospective";

  const profile: Omit<UserProfile, "id"> = {
    uid: user.uid,
    name: pending?.name || user.displayName || "",
    email: user.email ?? "",
    phone: pending?.phone || "",
    role,
    blocked: false,
    adminNotes: pending?.adminNotes || "",
    createdAt: now,
    ...(pending ? { linkedAt: now } : {}),
  };

  await setDoc(ref, profile);

  // Claimed — remove the placeholder so it stops showing as pending.
  if (pending && email) {
    await deleteDoc(doc(db, "pendingClients", email)).catch(() => undefined);
  }

  return { id: user.uid, ...profile };
}
