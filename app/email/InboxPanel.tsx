"use client";

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/Toast";
import NotifyButton from "./NotifyButton";
import { getDb } from "@/lib/firebase";
import {
  ALL_MAILBOXES,
  atLeast,
  DEFAULT_MAILBOXES,
  type EmailAccess,
  type EmailDraft,
  type HelpMessage,
  type HelpThread,
  type Mailbox,
} from "@/lib/emailTypes";

import ComposeModal from "./ComposeModal";
import MessageBody from "./MessageBody";
import ReplyBox, { type ReplyPayload } from "./ReplyBox";
import { deleteDraft, loadDrafts } from "./useAutosave";
import styles from "./email.module.css";

/** Threads recorded before mailboxes existed all came from help@. */
const LEGACY_MAILBOX = "help@wjohnstonmedia.com";

type View =
  | "inbox"
  | "sent"
  | "drafts"
  | "starred"
  | "archived"
  | "closed";

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "inbox", label: "Inbox", icon: "▤" },
  { id: "sent", label: "Sent", icon: "➤" },
  { id: "drafts", label: "Drafts", icon: "✎" },
  { id: "starred", label: "Starred", icon: "★" },
  { id: "archived", label: "Archived", icon: "▣" },
  { id: "closed", label: "Done", icon: "✓" },
];

/**
 * Threads written before the direction flags existed predate composing, so
 * everything on record then had arrived rather than been sent.
 */
function received(t: HelpThread): boolean {
  return t.hasInbound ?? !t.hasOutbound;
}

/** Commas, semicolons, spaces or newlines — whichever they typed or pasted. */
function addresses(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function initials(name: string | undefined, email: string): string {
  const source = name?.trim() || email;
  const parts = source.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

/** "3:42 pm" today, "12 Sep" this year, "12 Sep 25" beyond. */
function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("en-AU", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "2-digit" }),
  });
}

/**
 * The inbox: every address, in one place.
 *
 * Shaped like a mail client because that is the shape people already know —
 * a rail of mailboxes, a list of conversations, a reading pane. The one thing
 * it does that a normal client doesn't is start at "All inboxes", because for
 * a one-person studio the question is almost never "what's in help@", it's
 * "has anyone written to me".
 */
export default function InboxPanel({
  access,
  getToken,
  onCount,
  initialThreadId,
  initialMailbox,
  openCompose = false,
  composeNonce = 0,
}: {
  access: EmailAccess;
  getToken: () => Promise<string | null>;
  onCount: (n: number) => void;
  /** From ?thread= — opens straight onto that conversation. */
  initialThreadId?: string;
  /** From ?mailbox= — selects that mailbox on arrival. */
  initialMailbox?: string;
  openCompose?: boolean;
  /** Bumped by the phone tab bar to open compose from anywhere. */
  composeNonce?: number;
}) {
  const { toast } = useToast();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>(DEFAULT_MAILBOXES);
  const [threads, setThreads] = useState<HelpThread[] | null>(null);
  const [messages, setMessages] = useState<HelpMessage[] | null>(null);

  /**
   * Open on your own address when you have one. Someone who runs marketing
   * should land in marketing@, not in a merged pile of every address in the
   * business — the shared mailboxes are still a click away.
   */
  const [selected, setSelected] = useState<string>(
    initialMailbox ?? access.primaryFrom ?? ALL_MAILBOXES,
  );
  const [view, setView] = useState<View>("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  /**
   * Everything half-written, this person's own.
   *
   * Held here rather than fetched per screen so the count on the rail is
   * right the moment something is saved, and so opening a conversation can
   * put back what was being typed in it without another round trip.
   */
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  /** The draft the composer was opened on, if it was opened on one. */
  const [openDraft, setOpenDraft] = useState<EmailDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(openCompose);
  /** So a linked thread only auto-opens once, not on every reload of the list. */
  const [linkHandled, setLinkHandled] = useState(false);

  const canReply = atLeast(access.level, "draft");

  /**
   * Bumped by the Refresh button to re-read the mailbox rail and restart the
   * live listener. The list keeps itself current on its own, but a button
   * that visibly does something beats staring at a window wondering whether
   * the silence is "no new mail" or "nothing is connected".
   */
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /** When the list last arrived, for the line next to the button. */
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  /**
   * A live listener answers from its cache in the same frame, so clearing the
   * spinner when the data arrives would flash it for one frame and read as a
   * button that does nothing. It spins for half a second instead.
   */
  const spinTimer = useRef<number | null>(null);
  const refresh = useCallback(() => {
    setRefreshing(true);
    setNonce((n) => n + 1);
    if (spinTimer.current) window.clearTimeout(spinTimer.current);
    spinTimer.current = window.setTimeout(() => setRefreshing(false), 500);
  }, []);

  useEffect(
    () => () => {
      if (spinTimer.current) window.clearTimeout(spinTimer.current);
    },
    [],
  );

  /**
   * Re-reads this person's drafts.
   *
   * Through the API rather than a live listener: a draft is written by the
   * same browser that would be listening to it, so there is nothing to find
   * out from the server that is not already on screen. It is re-read after
   * sending, after closing the composer, and on a refresh.
   */
  const refreshDrafts = useCallback(async () => {
    try {
      setDrafts(await loadDrafts(getToken));
    } catch {
      // A drafts list that will not load must not take the inbox with it.
    }
  }, [getToken]);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts, nonce]);

  /** Thrown away on purpose. */
  const removeDraft = useCallback(
    async (id: string) => {
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      try {
        await deleteDraft(id, getToken);
      } catch {
        toast("Could not delete that draft.", "error");
        void refreshDrafts();
      }
    },
    [getToken, refreshDrafts, toast],
  );

  /**
   * The mailboxes this person is allowed to read.
   *
   * A restricted person must ask only for what they're allowed to read.
   * Firestore evaluates the rule against every document a list returns, so an
   * unconstrained query does not come back filtered — it fails outright. The
   * rules are the boundary; this is how you stay inside it.
   */
  const limitedKey = (access.visibleMailboxes ?? []).join(",");
  const limitedTo = useMemo(
    () => (limitedKey ? limitedKey.split(",") : []),
    // Keyed on the joined value, not the array: a parent that rebuilds its
    // access object each render would otherwise re-subscribe the listener —
    // and every re-subscribe is a fresh full read of the collection.
    [limitedKey],
  );

  /**
   * The mailbox rail, read once.
   *
   * Addresses change when somebody edits the mailbox list, which is roughly
   * never — so this is a plain fetch rather than a second live listener.
   */
  const loadMailboxes = useCallback(async () => {
    try {
      const boxSnap = await getDocs(collection(getDb(), "mailboxes"));

      // Configured mailboxes win; the defaults fill in so a fresh install
      // still has somewhere for mail to land.
      const configured = boxSnap.docs.map(
        (d) => ({ address: d.id, ...d.data() }) as Mailbox,
      );
      const merged = [...configured];
      for (const fallback of DEFAULT_MAILBOXES) {
        if (!merged.some((m) => m.address === fallback.address)) {
          merged.push(fallback);
        }
      }
      merged.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      // A send-only address has no inbox to show and never will, so it is
      // left out of the rail entirely rather than sitting there permanently
      // empty. It stays available to send as.
      //
      // Personal mailboxes are somebody's own mail: you see your own, and
      // everyone else's only with seesPersonalMail. The rules enforce this —
      // this is so the rail doesn't offer a mailbox that would come back
      // empty and look broken.
      const inboxes = merged.filter(
        (m) =>
          !m.sendOnly &&
          (!m.personal ||
            m.ownerUid === access.uid ||
            access.seesPersonalMail === true),
      );
      const readable =
        limitedTo.length > 0
          ? inboxes.filter((m) => limitedTo.includes(m.address))
          : inboxes;
      setMailboxes(readable);

      // Their own address may be one they aren't allowed to read — a grant can
      // be narrowed after it was handed out. Falling back beats showing an
      // empty mailbox and no explanation for it.
      setSelected((current) =>
        current === ALL_MAILBOXES || readable.some((m) => m.address === current)
          ? current
          : ALL_MAILBOXES,
      );
    } catch (err) {
      console.error("[email] mailboxes failed:", err);
    }
  }, [access.uid, access.seesPersonalMail, limitedTo]);

  useEffect(() => {
    void loadMailboxes();
  }, [loadMailboxes, nonce]);

  /**
   * Callbacks held in a ref rather than in the dependency list.
   *
   * The listener below must not tear down and re-subscribe because a parent
   * re-rendered and handed us a new function identity — every resubscribe is
   * a fresh full read of the collection.
   */
  const onCountRef = useRef(onCount);
  const toastRef = useRef(toast);
  useEffect(() => {
    onCountRef.current = onCount;
    toastRef.current = toast;
  }, [onCount, toast]);

  /**
   * The conversation list, live.
   *
   * onSnapshot rather than a single read: mail arrives while the window is
   * open, and an inbox that only shows what existed at page load makes a
   * delivered email look lost — which is exactly how this looked while the
   * inbound webhook was being debugged. Firestore pushes the change, so
   * there is nothing to poll and no cost to an idle tab.
   */
  useEffect(() => {
    const db = getDb();
    const col = collection(db, "helpThreads");
    const wanted =
      limitedTo.length > 0
        ? query(
            col,
            // "in" takes at most 30 values, which is far more mailboxes than
            // anyone is going to be granted.
            where("mailbox", "in", limitedTo.slice(0, 30)),
            orderBy("lastMessageAt", "desc"),
            limit(300),
          )
        : query(col, orderBy("lastMessageAt", "desc"), limit(300));

    const stop = onSnapshot(
      wanted,
      (snap) => {
        const rows = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as HelpThread,
        );
        setThreads(rows);
        setSyncedAt(Date.now());
        onCountRef.current(
          rows.filter(
            (t) =>
              t.unread &&
              (t.hasInbound ?? !t.hasOutbound) &&
              !t.archived &&
              t.status !== "Closed",
          ).length,
        );
      },
      (err) => {
        console.error("[email] inbox failed:", err);
        setThreads([]);
        setRefreshing(false);
        toastRef.current("Could not load the inbox.", "error");
      },
    );

    return stop;
  }, [limitedTo, nonce]);

  const mailboxOf = (thread: HelpThread) => thread.mailbox ?? LEGACY_MAILBOX;

  /** Unread count per mailbox, for the rail. */
  const unreadBy = useMemo(() => {
    const counts = new Map<string, number>();
    for (const thread of threads ?? []) {
      if (thread.archived || thread.status === "Closed" || !thread.unread) {
        continue;
      }
      const box = mailboxOf(thread);
      counts.set(box, (counts.get(box) ?? 0) + 1);
    }
    return counts;
  }, [threads]);

  const totalUnread = useMemo(
    () => [...unreadBy.values()].reduce((a, b) => a + b, 0),
    [unreadBy],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return (threads ?? [])
      .filter((t) =>
        selected === ALL_MAILBOXES ? true : mailboxOf(t) === selected,
      )
      .filter((t) => {
        if (view === "sent") return Boolean(t.hasOutbound) && !t.archived;
        if (view === "starred") return t.starred;
        if (view === "archived") return t.archived;
        if (view === "closed") return t.status === "Closed";
        // The Inbox is mail that came to you. A thread you started by writing
        // to someone lives in Sent until they answer — showing both in one
        // undivided list is what made this feel unlike a mail client.
        return received(t) && !t.archived && t.status !== "Closed";
      })
      .filter(
        (t) =>
          !term ||
          t.subject.toLowerCase().includes(term) ||
          t.fromEmail.toLowerCase().includes(term) ||
          t.fromName?.toLowerCase().includes(term) ||
          t.snippet?.toLowerCase().includes(term),
      );
  }, [threads, selected, view, search]);

  const current = threads?.find((t) => t.id === openId) ?? null;

  const openThread = useCallback(async (thread: HelpThread) => {
    setOpenId(thread.id);
    // The address bar now names this conversation, so the link is copyable.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("thread", thread.id);
      window.history.replaceState(null, "", url);
    } catch {
      // Not worth failing the click over.
    }
    setMessages(null);
    try {
      const snap = await getDocs(
        query(
          collection(getDb(), "helpThreads", thread.id, "messages"),
          orderBy("createdAt", "asc"),
        ),
      );
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HelpMessage));

      if (thread.unread) {
        await updateDoc(doc(getDb(), "helpThreads", thread.id), { unread: false });
        setThreads(
          (prev) =>
            prev?.map((t) =>
              t.id === thread.id ? { ...t, unread: false } : t,
            ) ?? null,
        );
      }
    } catch (err) {
      console.error("[email] thread failed:", err);
      setMessages([]);
    }
  }, []);

  // A linked conversation opens itself once the list has arrived.
  useEffect(() => {
    if (linkHandled || !initialThreadId || !threads) return;
    const wanted = threads.find((t) => t.id === initialThreadId);
    setLinkHandled(true);
    if (wanted) void openThread(wanted);
  }, [initialThreadId, threads, linkHandled, openThread]);

  /**
   * Picks up something half-written.
   *
   * A reply draft belongs to a conversation, so it opens the conversation —
   * the words come back in the reply box underneath it. A new email opens
   * the composer on the form, not on the "how do you want to start" screen.
   */
  const openDraftEntry = useCallback(
    (entry: EmailDraft) => {
      if (entry.kind === "reply" && entry.threadId) {
        const wanted = threads?.find((t) => t.id === entry.threadId);
        setView("inbox");
        if (wanted) void openThread(wanted);
        else toast("That conversation is no longer in the list.", "error");
        return;
      }
      setOpenDraft(entry);
      setComposing(true);
    },
    [threads, openThread, toast],
  );

  /** Optimistic flag toggles — starring shouldn't feel like a round trip. */
  async function flag(thread: HelpThread, patch: Partial<HelpThread>) {
    setThreads(
      (prev) =>
        prev?.map((t) => (t.id === thread.id ? { ...t, ...patch } : t)) ?? null,
    );
    try {
      await updateDoc(doc(getDb(), "helpThreads", thread.id), patch);
    } catch {
      toast("Could not save that.", "error");
      refresh();
    }
  }

  /**
   * The same patch across every ticked thread.
   *
   * One batch rather than a loop of writes: a half-applied "archive these
   * twelve" is worse than a failure, because you cannot see which six moved.
   */
  async function bulk(patch: Partial<HelpThread>) {
    const ids = [...picked];
    if (ids.length === 0) return;

    setThreads(
      (prev) =>
        prev?.map((t) => (picked.has(t.id) ? { ...t, ...patch } : t)) ?? null,
    );
    setPicked(new Set());

    try {
      const db = getDb();
      const batch = writeBatch(db);
      for (const id of ids) batch.update(doc(db, "helpThreads", id), patch);
      await batch.commit();
    } catch {
      toast("Could not apply that to all of them.", "error");
      refresh();
    }
  }

  /**
   * Sends a reply. Resolves true only if it actually went, so the box knows
   * whether it may throw away what was typed.
   */
  async function sendReply(payload: ReplyPayload): Promise<boolean> {
    if (!openId || !payload.message.trim() || busy) return false;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return false;
      }

      const response = await fetch("/api/email/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          threadId: openId,
          message: payload.message,
          close: payload.close,
          cc: addresses(payload.cc),
          bcc: addresses(payload.bcc),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        toast(result.error ?? "Could not send that reply.", "error");
        return false;
      }

      toast(
        result.emailed
          ? payload.close
            ? "Replied and marked done."
            : "Reply sent."
          : "Saved, but the email didn't send — check Resend.",
        result.emailed ? "success" : "error",
      );
      // The list updates itself — the listener sees the write. Only the open
      // conversation needs re-reading, for the message that was just sent.
      if (current) void openThread(current);
      void refreshDrafts();
      return true;
    } catch {
      toast("Network error — please try again.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Threads ticked for a bulk action. */
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const firstNonce = useRef(composeNonce);
  useEffect(() => {
    if (composeNonce !== firstNonce.current) setComposing(true);
  }, [composeNonce]);

  const selectedBox = mailboxes.find((m) => m.address === selected);

  /**
   * Your address, and everyone else's.
   *
   * "Mine" is only real if the address you've been given is one you're
   * actually allowed to read — a My Inbox pointing at a mailbox the rules
   * will refuse is worse than no My Inbox at all.
   */
  const mine =
    mailboxes.find((m) => m.address === access.primaryFrom) ?? null;
  const shared = mailboxes.filter((m) => m.address !== mine?.address);

  return (
    <div className={styles.mail} data-reading={openId ? "true" : "false"}>
      {/* ── Mailboxes ─────────────────────────────── */}
      <aside className={styles.rail}>
        {atLeast(access.level, "send") ? (
          <button
            type="button"
            className={styles.composeBtn}
            onClick={() => setComposing(true)}
          >
            <span aria-hidden="true">✎</span> Write
          </button>
        ) : null}

        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.railItem} ${
              view === item.id ? styles.railOn : ""
            }`}
            onClick={() => {
              setView(item.id);
              setOpenId(null);
            }}
          >
            <span className={styles.railIcon} aria-hidden="true">
              {item.icon}
            </span>
            <span className={styles.railText}>
              <strong>{item.label}</strong>
            </span>
            {item.id === "inbox" && totalUnread > 0 ? (
              <span className={styles.railCount}>{totalUnread}</span>
            ) : null}
            {item.id === "drafts" && drafts.length > 0 ? (
              <span className={styles.railCount}>{drafts.length}</span>
            ) : null}
          </button>
        ))}

        {/* ── Your own address ───────────────────────
            Listed on its own above the shared ones, because "my mail" and
            "the company's mail" are different questions and someone who runs
            marketing shouldn't have to find marketing@ in a list each time. */}
        {mine ? (
          <>
            <p className={styles.railHead}>Mine</p>
            <button
              type="button"
              className={`${styles.railItem} ${
                selected === mine.address ? styles.railOn : ""
              }`}
              onClick={() => {
                setSelected(mine.address);
                setOpenId(null);
              }}
            >
              <span className={styles.railIcon} aria-hidden="true">
                ●
              </span>
              <span className={styles.railText}>
                <strong>My Inbox</strong>
                <em>{mine.address}</em>
              </span>
              {(unreadBy.get(mine.address) ?? 0) > 0 ? (
                <span className={styles.railCount}>
                  {unreadBy.get(mine.address)}
                </span>
              ) : null}
            </button>
          </>
        ) : null}

        {/* Shared addresses, minus your own — it is already above. Only the
            ones this person has been granted; the rest were never fetched. */}
        {shared.length ? (
          <p className={styles.railHead}>
            {mine ? "Also mine to read" : "Mailboxes"}
          </p>
        ) : null}

        {shared.length ? (
          <button
            type="button"
            className={`${styles.railItem} ${styles.railSmall} ${
              selected === ALL_MAILBOXES ? styles.railOn : ""
            }`}
            onClick={() => {
              setSelected(ALL_MAILBOXES);
              setOpenId(null);
            }}
          >
            <span className={styles.railIcon} aria-hidden="true">
              ✉
            </span>
            <span className={styles.railText}>
              <strong>All addresses</strong>
            </span>
          </button>
        ) : null}

        {shared.map((box) => {
          const unread = unreadBy.get(box.address) ?? 0;
          return (
            <button
              key={box.address}
              type="button"
              className={`${styles.railItem} ${styles.railSmall} ${
                selected === box.address ? styles.railOn : ""
              }`}
              onClick={() => {
                setSelected(box.address);
                setOpenId(null);
              }}
            >
              <span className={styles.railIcon} aria-hidden="true">
                ◍
              </span>
              <span className={styles.railText}>
                <strong>{box.label}</strong>
                <em>{box.address}</em>
              </span>
              {unread > 0 ? (
                <span className={styles.railCount}>{unread}</span>
              ) : null}
            </button>
          );
        })}

        <p className={styles.railHead}>This device</p>
        <NotifyButton mailboxes={mailboxes} getToken={getToken} />
      </aside>

      {/* ── Conversations ─────────────────────────── */}
      <section className={styles.threadList}>
        <div className={styles.searchBar}>
          <input
            className={styles.search}
            value={search}
            placeholder={
              selectedBox ? `Search ${selectedBox.label}` : "Search all mail"
            }
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search mail"
          />
          {/* The list is live, so this is a reassurance control rather than
              the only way to see new mail: it re-reads the mailbox rail and
              restarts the listener, and the timestamp underneath says when
              anything last arrived. */}
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={refresh}
            disabled={refreshing}
            title={
              syncedAt
                ? `Last updated ${new Date(syncedAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : "Refresh"
            }
            aria-label="Refresh"
          >
            <span
              className={refreshing ? styles.refreshSpin : undefined}
              aria-hidden="true"
            >
              ⟳
            </span>
          </button>
        </div>

        <p className={styles.syncLine}>
          {refreshing
            ? "Refreshing…"
            : syncedAt
              ? `Live · updated ${new Date(syncedAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : "Connecting…"}
        </p>

        {/* Bulk toolbar. Appears only with a selection, the way Gmail's does
            — a row of disabled buttons above an untouched list is noise. */}
        {picked.size > 0 ? (
          <div className={styles.bulkBar}>
            <label className={styles.bulkAll}>
              <input
                type="checkbox"
                checked={picked.size === visible.length && visible.length > 0}
                onChange={(e) =>
                  setPicked(
                    e.target.checked
                      ? new Set(visible.map((t) => t.id))
                      : new Set(),
                  )
                }
                aria-label="Select all"
              />
              <span>{picked.size} selected</span>
            </label>
            <button type="button" className={styles.bulkBtn} onClick={() => bulk({ archived: true })}>
              Archive
            </button>
            <button type="button" className={styles.bulkBtn} onClick={() => bulk({ unread: false })}>
              Mark read
            </button>
            <button type="button" className={styles.bulkBtn} onClick={() => bulk({ unread: true })}>
              Mark unread
            </button>
            <button type="button" className={styles.bulkBtn} onClick={() => setPicked(new Set())}>
              Cancel
            </button>
          </div>
        ) : null}

        {view === "drafts" ? (
          drafts.length === 0 ? (
            <div className={styles.mailEmpty}>
              <strong>Nothing half-written</strong>
              Anything you start writing is saved here by itself, so you can
              close the window mid-sentence and pick it up later.
            </div>
          ) : (
            <ul className={styles.threads}>
              {drafts.map((entry) => (
                <li key={entry.id} className={styles.row2}>
                  <button
                    type="button"
                    className={styles.row2Main}
                    onClick={() => openDraftEntry(entry)}
                  >
                    <span className={styles.row2From}>
                      {entry.kind === "reply"
                        ? `Reply to ${entry.to || entry.threadSubject || "a conversation"}`
                        : entry.to || "No recipient yet"}
                    </span>
                    <span className={styles.row2Subject}>
                      {entry.subject ||
                        (entry.kind === "reply"
                          ? `Re: ${entry.threadSubject ?? ""}`
                          : "No subject")}
                    </span>
                    <span className={styles.row2Snippet}>
                      {entry.message?.replace(/\s+/g, " ").slice(0, 120) ||
                        "Nothing written yet"}
                    </span>
                    <span className={styles.row2When}>
                      {when(entry.updatedAt)}
                    </span>
                  </button>

                  <span className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.rowAction}
                      onClick={() => void removeDraft(entry.id)}
                      title="Delete draft"
                      aria-label="Delete draft"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : threads === null ? (
          <p className={styles.mailEmpty}>Loading…</p>
        ) : visible.length === 0 ? (
          <div className={styles.mailEmpty}>
            <strong>
              {threads.length === 0 ? "No mail yet" : "Nothing here"}
            </strong>
            {threads.length === 0
              ? "Once your addresses are forwarding to the platform, conversations land here."
              : "Try another mailbox, or clear the search."}
          </div>
        ) : (
          <ul className={styles.threads}>
            {visible.map((thread) => (
              <li
                key={thread.id}
                className={`${styles.row2} ${
                  thread.unread ? styles.row2Unread : ""
                } ${openId === thread.id ? styles.row2Open : ""} ${
                  picked.has(thread.id) ? styles.row2Picked : ""
                }`}
              >
                <input
                  type="checkbox"
                  className={styles.pick}
                  checked={picked.has(thread.id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(thread.id);
                    else next.delete(thread.id);
                    setPicked(next);
                  }}
                  aria-label={`Select ${thread.subject}`}
                />

                <button
                  type="button"
                  className={`${styles.star} ${thread.starred ? styles.starOn : ""}`}
                  onClick={() => flag(thread, { starred: !thread.starred })}
                  aria-label={thread.starred ? "Unstar" : "Star"}
                  aria-pressed={thread.starred ?? false}
                >
                  ★
                </button>

                {/* One line: who, then subject and preview running together,
                    then the date hard right — the shape every mail client
                    uses, because it fits three times as many conversations
                    on a screen as a stacked card does. */}
                <button
                  type="button"
                  className={styles.row2Main}
                  onClick={() => openThread(thread)}
                >
                  <span className={styles.row2From}>
                    {view === "sent" ? "To " : ""}
                    {thread.fromName || thread.fromEmail}
                  </span>
                  <span className={styles.row2Text}>
                    <span className={styles.row2Subject}>{thread.subject}</span>
                    <span className={styles.row2Snippet}>
                      {" "}
                      — {thread.snippet}
                    </span>
                  </span>
                  {selected === ALL_MAILBOXES ? (
                    <span className={styles.row2Box}>{mailboxOf(thread)}</span>
                  ) : null}
                  {thread.lastAuthorName ? (
                    <span
                      className={styles.threadBy}
                      title={`Last reply by ${thread.lastAuthorName}`}
                    >
                      {thread.lastAuthorName.split(/\s+/)[0]}
                    </span>
                  ) : null}
                  <span className={styles.row2When}>
                    {when(thread.lastMessageAt)}
                  </span>
                </button>

                {/* Revealed on hover, hiding the date beneath — Gmail's trick,
                    and the reason archiving a thread is one gesture. */}
                <span className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.rowAction}
                    onClick={() => flag(thread, { archived: !thread.archived })}
                    title={thread.archived ? "Unarchive" : "Archive"}
                    aria-label={thread.archived ? "Unarchive" : "Archive"}
                  >
                    ▣
                  </button>
                  <button
                    type="button"
                    className={styles.rowAction}
                    onClick={() => flag(thread, { unread: !thread.unread })}
                    title={thread.unread ? "Mark read" : "Mark unread"}
                    aria-label={thread.unread ? "Mark read" : "Mark unread"}
                  >
                    {thread.unread ? "✉" : "◍"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Reading pane ──────────────────────────── */}
      <section className={styles.reader}>
        {!current ? (
          <div className={styles.readerEmpty}>
            <span className={styles.readerMark} aria-hidden="true">
              ✉
            </span>
            <p>Pick a conversation to read it.</p>
          </div>
        ) : (
          <>
            <header className={styles.readerHead}>
              {/* Only shown on phones, where the reader covers the list. */}
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => {
                  setOpenId(null);
                  try {
                    const url = new URL(window.location.href);
                    url.searchParams.delete("thread");
                    window.history.replaceState(null, "", url);
                  } catch {
                    // Same — cosmetic.
                  }
                }}
              >
                ← Inbox
              </button>
              <div>
                <h2 className={styles.readerSubject}>{current.subject}</h2>
                <p className={styles.readerMeta}>
                  {current.fromName
                    ? `${current.fromName} · ${current.fromEmail}`
                    : current.fromEmail}
                  {" → "}
                  {mailboxOf(current)}
                </p>
              </div>
              <div className={styles.readerActions}>
                <span
                  className={`jm-badge ${
                    current.status === "Open"
                      ? "jm-badge--copper"
                      : current.status === "Waiting"
                        ? "jm-badge--amber"
                        : "jm-badge--muted"
                  }`}
                >
                  {current.status}
                </span>
                <button
                  type="button"
                  className="jm-btn-ghost jm-btn-sm"
                  onClick={() => flag(current, { archived: !current.archived })}
                >
                  {current.archived ? "Unarchive" : "Archive"}
                </button>
              </div>
            </header>

            <div className={styles.readerBody}>
              {messages === null ? (
                <p className={styles.mailEmpty}>Loading…</p>
              ) : (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className={`${styles.mailMsg} ${
                      message.direction === "out" ? styles.mailMsgOut : ""
                    }`}
                  >
                    <div className={styles.mailMsgHead}>
                      <span className={styles.avatarSm} aria-hidden="true">
                        {message.direction === "out"
                          ? "JM"
                          : initials(message.fromName, message.fromEmail)}
                      </span>
                      <span>
                        <strong>
                          {message.direction === "out"
                            ? "Johnston Media"
                            : message.fromName || message.fromEmail}
                        </strong>
                        <em>
                          {message.direction === "out" && message.authorEmail
                            ? `sent by ${message.authorEmail} · `
                            : ""}
                          {when(message.createdAt)}
                        </em>
                      </span>
                    </div>
                    {message.cc?.length ? (
                      <p className={styles.mailMsgCc}>
                        cc {message.cc.join(", ")}
                      </p>
                    ) : null}
                    {message.bcc?.length ? (
                      <p className={styles.mailMsgCc}>
                        bcc {message.bcc.join(", ")}
                      </p>
                    ) : null}
                    <MessageBody html={message.html} text={message.body} />
                  </article>
                ))
              )}
            </div>

            {canReply ? (
              // Keyed on the conversation, so each one gets its own box and
              // its own draft. One box shared across threads is how half an
              // answer to one person ends up saved against another.
              <ReplyBox
                key={current.id}
                thread={current}
                mailbox={mailboxOf(current)}
                draft={
                  drafts.find(
                    (d) => d.kind === "reply" && d.threadId === current.id,
                  ) ?? null
                }
                getToken={getToken}
                busy={busy}
                onSend={sendReply}
              />
            ) : (
              <footer className={styles.composeBar}>
                <p className={styles.readerMeta}>
                  You have read-only access, so you can follow the conversation
                  but not reply.
                </p>
              </footer>
            )}
          </>
        )}
      </section>

      {composing ? (
        <ComposeModal
          // Keyed on the draft, so opening a second one replaces the form
          // rather than pouring the new words into the old one.
          key={openDraft?.id ?? "new"}
          access={access}
          mailboxes={mailboxes}
          getToken={getToken}
          draft={openDraft}
          onClose={() => {
            setComposing(false);
            setOpenDraft(null);
            // Closing mid-sentence is the case drafts exist for, so the
            // folder has to be right the moment the window goes away.
            void refreshDrafts();
          }}
          onSent={() => {
            setComposing(false);
            setOpenDraft(null);
            void refreshDrafts();
          }}
        />
      ) : null}
    </div>
  );
}
