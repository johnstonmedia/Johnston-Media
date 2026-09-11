"use client";

import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/Toast";
import NotifyButton from "./NotifyButton";
import { getDb } from "@/lib/firebase";
import {
  ALL_MAILBOXES,
  atLeast,
  DEFAULT_MAILBOXES,
  type EmailAccess,
  type HelpMessage,
  type HelpThread,
  type Mailbox,
} from "@/lib/emailTypes";

import ComposeModal from "./ComposeModal";
import styles from "./email.module.css";

/** Threads recorded before mailboxes existed all came from help@. */
const LEGACY_MAILBOX = "help@wjohnstonmedia.com";

type View = "inbox" | "sent" | "starred" | "archived" | "closed";

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "inbox", label: "Inbox", icon: "▤" },
  { id: "sent", label: "Sent", icon: "➤" },
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
}: {
  access: EmailAccess;
  getToken: () => Promise<string | null>;
  onCount: (n: number) => void;
  /** From ?thread= — opens straight onto that conversation. */
  initialThreadId?: string;
  /** From ?mailbox= — selects that mailbox on arrival. */
  initialMailbox?: string;
  openCompose?: boolean;
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
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(openCompose);
  /** So a linked thread only auto-opens once, not on every reload of the list. */
  const [linkHandled, setLinkHandled] = useState(false);

  const canReply = atLeast(access.level, "draft");

  const load = useCallback(async () => {
    try {
      const db = getDb();
      // A restricted person must ask only for what they're allowed to read.
      // Firestore evaluates the rule against every document a list returns,
      // so an unconstrained query doesn't return a filtered list — it fails
      // outright. The rules are the boundary; this is how you stay inside it.
      const limitedTo = access.visibleMailboxes ?? [];
      const restricted = limitedTo.length > 0;

      const [boxSnap, threadSnap] = await Promise.all([
        getDocs(collection(db, "mailboxes")),
        getDocs(
          restricted
            ? query(
                collection(db, "helpThreads"),
                // "in" takes at most 30 values, which is far more mailboxes
                // than anyone is going to be granted.
                where("mailbox", "in", limitedTo.slice(0, 30)),
                orderBy("lastMessageAt", "desc"),
                limit(300),
              )
            : query(
                collection(db, "helpThreads"),
                orderBy("lastMessageAt", "desc"),
                limit(300),
              ),
        ),
      ]);

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
      const readable = restricted
        ? merged.filter((m) => limitedTo.includes(m.address))
        : merged;
      setMailboxes(readable);

      // Their own address may be one they aren't allowed to read — a grant can
      // be narrowed after it was handed out. Falling back beats showing an
      // empty mailbox and no explanation for it.
      setSelected((current) =>
        current === ALL_MAILBOXES || readable.some((m) => m.address === current)
          ? current
          : ALL_MAILBOXES,
      );

      const rows = threadSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as HelpThread,
      );
      setThreads(rows);
      onCount(
        rows.filter(
          (t) =>
            t.unread &&
            (t.hasInbound ?? !t.hasOutbound) &&
            !t.archived &&
            t.status !== "Closed",
        )
          .length,
      );
    } catch (err) {
      console.error("[email] inbox failed:", err);
      setThreads([]);
      toast("Could not load the inbox.", "error");
    }
  }, [toast, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

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
    setReply("");
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
      void load();
    }
  }

  async function send(close: boolean) {
    if (!openId || !reply.trim() || busy) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        toast("Your session expired — sign in again.", "error");
        return;
      }

      const response = await fetch("/api/email/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ threadId: openId, message: reply, close }),
      });
      const result = await response.json();

      if (!response.ok) {
        toast(result.error ?? "Could not send that reply.", "error");
        return;
      }

      toast(
        result.emailed
          ? close
            ? "Replied and marked done."
            : "Reply sent."
          : "Saved, but the email didn't send — check Resend.",
        result.emailed ? "success" : "error",
      );
      setReply("");
      await load();
      if (current) void openThread(current);
    } catch {
      toast("Network error — please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

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
        </div>

        {threads === null ? (
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
              <li key={thread.id}>
                <button
                  type="button"
                  className={`${styles.threadRow} ${
                    thread.unread ? styles.threadUnread : ""
                  } ${openId === thread.id ? styles.threadOpen : ""}`}
                  onClick={() => openThread(thread)}
                >
                  <span className={styles.avatar} aria-hidden="true">
                    {initials(thread.fromName, thread.fromEmail)}
                  </span>

                  <span className={styles.threadMain}>
                    <span className={styles.threadTop}>
                      <span className={styles.threadFrom}>
                        {/* In Sent, the useful name is the person it went to.
                            The thread is keyed on the other party either way,
                            so it is the same field — only the label changes. */}
                        {view === "sent" ? "To " : ""}
                        {thread.fromName || thread.fromEmail}
                      </span>
                      <span className={styles.threadWhen}>
                        {when(thread.lastMessageAt)}
                      </span>
                    </span>
                    <span className={styles.threadSubject}>
                      {thread.subject}
                    </span>
                    <span className={styles.threadSnippet}>
                      {thread.snippet}
                    </span>
                    {selected === ALL_MAILBOXES ? (
                      <span className={styles.threadBox}>
                        {mailboxOf(thread)}
                      </span>
                    ) : null}
                  </span>
                </button>

                <button
                  type="button"
                  className={`${styles.star} ${thread.starred ? styles.starOn : ""}`}
                  onClick={() => flag(thread, { starred: !thread.starred })}
                  aria-label={thread.starred ? "Unstar" : "Star"}
                  aria-pressed={thread.starred ?? false}
                >
                  ★
                </button>
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
                    <div className={styles.mailMsgBody}>{message.body}</div>
                  </article>
                ))
              )}
            </div>

            {canReply ? (
              <footer className={styles.composeBar}>
                <textarea
                  className={styles.composeBox}
                  rows={3}
                  value={reply}
                  placeholder={`Reply from ${mailboxOf(current)}…`}
                  onChange={(e) => setReply(e.target.value)}
                />
                <div className={styles.composeActions}>
                  <button
                    type="button"
                    className="jm-btn-primary jm-btn-sm"
                    onClick={() => send(false)}
                    disabled={busy || !reply.trim()}
                  >
                    {busy ? "Sending…" : "Send"}
                  </button>
                  <button
                    type="button"
                    className="jm-btn-ghost jm-btn-sm"
                    onClick={() => send(true)}
                    disabled={busy || !reply.trim()}
                  >
                    Send &amp; done
                  </button>
                </div>
              </footer>
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
          access={access}
          mailboxes={mailboxes}
          getToken={getToken}
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
