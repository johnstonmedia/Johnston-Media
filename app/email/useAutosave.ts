"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { EmailDraft } from "@/lib/emailTypes";

/** What a draft is made of, as the fields are typed rather than as sent. */
export interface DraftBody {
  kind: "compose" | "reply";
  threadId?: string;
  threadSubject?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  recipientName?: string;
  message?: string;
  templateId?: string;
  extras?: Record<string, string>;
}

export type SaveState = "idle" | "saving" | "saved" | "failed";

/** True when there is nothing in it worth keeping. */
export function blank(draft: DraftBody): boolean {
  return (
    !draft.to?.trim() &&
    !draft.cc?.trim() &&
    !draft.bcc?.trim() &&
    !draft.subject?.trim() &&
    !draft.recipientName?.trim() &&
    !draft.message?.trim() &&
    Object.values(draft.extras ?? {}).every((value) => !value?.trim())
  );
}

/** Every draft of this person's, newest first. */
export async function loadDrafts(
  getToken: () => Promise<string | null>,
): Promise<EmailDraft[]> {
  const token = await getToken();
  if (!token) return [];
  const response = await fetch("/api/email/drafts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return [];
  const result = await response.json();
  return (result.drafts ?? []) as EmailDraft[];
}

export async function deleteDraft(
  id: string,
  getToken: () => Promise<string | null>,
): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await fetch(`/api/email/drafts?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Saves what is being typed, without being asked.
 *
 * Debounced rather than saved per keystroke: a save a second into a pause
 * costs one request per sentence instead of one per letter, and a pause is
 * the moment the words are worth keeping anyway.
 *
 * Three things make it trustworthy rather than merely present:
 *
 *   1. the draft is created on the first real keystroke and not before, so
 *      opening the composer and closing it again leaves nothing behind;
 *   2. emptying a draft deletes it, because a Drafts folder full of blank
 *      rows is a folder people learn to ignore; and
 *   3. closing flushes immediately instead of waiting out the debounce —
 *      the last thing typed is exactly the thing most likely to be lost.
 */
export function useAutosave(
  draft: DraftBody,
  getToken: () => Promise<string | null>,
  options: { id?: string | null; enabled?: boolean } = {},
) {
  const [id, setId] = useState<string | null>(options.id ?? null);
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Held in refs so the save function never has to be rebuilt, and so the
  // flush on the way out sees the latest words rather than the ones from
  // whenever the effect last ran.
  const latest = useRef(draft);
  latest.current = draft;
  const idRef = useRef(id);
  idRef.current = id;
  /**
   * What was last written. Starts as the draft we were opened with, so
   * restoring one does not immediately save it back unchanged.
   */
  const written = useRef(JSON.stringify(draft));
  const enabled = options.enabled !== false;

  const save = useCallback(
    async (keepalive = false) => {
      const body = latest.current;
      const serialised = JSON.stringify(body);
      if (serialised === written.current) return;
      // Nothing typed yet and nothing stored: there is nothing to do.
      if (!idRef.current && blank(body)) {
        written.current = serialised;
        return;
      }

      const token = await getToken();
      if (!token) return;

      setState("saving");
      try {
        const response = await fetch("/api/email/drafts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ...body, id: idRef.current ?? undefined }),
          // Lets the browser finish the request after the tab goes away,
          // which is the one case where losing it would be most annoying.
          keepalive,
        });
        const result = await response.json();
        if (!response.ok || result.ok === false) throw new Error("refused");

        written.current = serialised;
        setId(result.id ?? null);
        idRef.current = result.id ?? null;
        setSavedAt(result.savedAt ?? new Date().toISOString());
        setState(result.id ? "saved" : "idle");
      } catch {
        // Saying so is the point: a draft that silently is not saving is
        // worse than no drafts at all.
        setState("failed");
      }
    },
    [getToken],
  );

  // The debounce.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => void save(), 1200);
    return () => window.clearTimeout(timer);
    // Serialised rather than by reference: the object is rebuilt every
    // render, and comparing by identity would restart the timer forever.
  }, [JSON.stringify(draft), enabled, save]);

  // Closing the tab, switching away, or unmounting: write it now.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => void save(true);
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      flush();
    };
  }, [enabled, save]);

  /** Forget this draft — after it has been sent, or thrown away. */
  const discard = useCallback(async () => {
    const current = idRef.current;
    written.current = JSON.stringify(latest.current);
    setId(null);
    idRef.current = null;
    setState("idle");
    if (current) await deleteDraft(current, getToken);
  }, [getToken]);

  return { id, state, savedAt, save, discard };
}
