/**
 * 🔥 FIREBASE — Admin SDK (server only).
 *
 * Used inside API route handlers to verify caller identity and to read/write
 * Firestore with elevated privileges (bypassing security rules). Never import
 * this from a client component.
 */
import "server-only";

import {
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { ADMIN_ROLES, type Role, type UserProfile } from "./types";

let app: App | null = null;

function getAdminApp(): App {
  if (app) return app;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercel stores the key with literal "\n" sequences — restore real newlines.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
    );
  }

  app =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });

  return app;
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export interface AuthedCaller {
  uid: string;
  email: string;
  role: Role;
  profile: UserProfile;
}

/**
 * Verifies the `Authorization: Bearer <idToken>` header and loads the caller's
 * Firestore profile. Returns null when the token is missing, invalid, or the
 * user has no profile / is blocked.
 */
export async function getCaller(
  request: Request,
): Promise<AuthedCaller | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token);
  } catch {
    return null;
  }

  const snap = await adminDb().collection("users").doc(decoded.uid).get();
  if (!snap.exists) return null;

  const profile = { id: snap.id, ...snap.data() } as UserProfile;
  if (profile.blocked) return null;

  return {
    uid: decoded.uid,
    email: decoded.email ?? profile.email,
    role: profile.role,
    profile,
  };
}

/** Verifies the caller is signed in AND holds an admin-level role. */
export async function requireAdmin(
  request: Request,
): Promise<AuthedCaller | null> {
  const caller = await getCaller(request);
  if (!caller || !ADMIN_ROLES.includes(caller.role)) return null;
  return caller;
}
