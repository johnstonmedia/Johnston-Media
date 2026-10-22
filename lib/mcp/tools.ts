/**
 * The tools this site exposes over MCP.
 *
 * Everything an assistant can do to Johnston Media from the outside is in
 * this file: read the mail, answer it, look at who has asked for a quote,
 * see what is in production. Each one is a small, named job — the protocol
 * is only worth having if the tool list reads like a description of the
 * business rather than a database schema.
 *
 * Three rules hold throughout:
 *
 *   1. the caller is the owner. A single token means there is no per-person
 *      access to enforce here, so the tools do not pretend otherwise — and
 *      the token must therefore be treated as what it is, a key to the whole
 *      mailbox;
 *   2. results are bounded. An assistant that asks for "the threads" and
 *      gets four hundred of them has spent its context on nothing, so every
 *      list takes a limit and caps it; and
 *   3. sending is explicit. Nothing here sends an email as a side effect of
 *      reading one.
 */
import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import { adminDb } from "../firebaseAdmin";
import { nameFor, paragraphs, sendPlainMail } from "../mailSend";
import { htmlToText } from "../sanitizeEmail";
import { plainShell } from "../emailSignature";
import type { HelpThread } from "../emailTypes";
import { SITE_URL } from "../siteUrl";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface McpTool {
  name: string;
  /** What it does, in the words someone would use to ask for it. */
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

// ── small helpers ──────────────────────────────────────────────

function str(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

function capped(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function addresses(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  const list: string[] = [];
  for (const entry of raw) {
    const address = str(entry, 200).toLowerCase();
    if (address && EMAIL_RE.test(address) && !list.includes(address)) {
      list.push(address);
    }
  }
  return list;
}

/** Threads written before the direction flags existed had all arrived. */
function received(thread: HelpThread): boolean {
  return thread.hasInbound ?? !thread.hasOutbound;
}

function threadSummary(thread: HelpThread) {
  return {
    id: thread.id,
    subject: thread.subject,
    from: thread.fromName ? `${thread.fromName} <${thread.fromEmail}>` : thread.fromEmail,
    mailbox: thread.mailbox,
    status: thread.status,
    unread: Boolean(thread.unread),
    archived: Boolean(thread.archived),
    direction: received(thread) ? "received" : "sent",
    snippet: thread.snippet,
    lastMessageAt: thread.lastMessageAt,
    url: `${SITE_URL}/email?section=inbox&thread=${thread.id}`,
  };
}

async function threadsFor(
  db: Firestore,
  limit: number,
): Promise<HelpThread[]> {
  const snap = await db
    .collection("helpThreads")
    .orderBy("lastMessageAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HelpThread);
}

// ── the tools ──────────────────────────────────────────────────

export const TOOLS: McpTool[] = [
  {
    name: "list_mailboxes",
    description:
      "Every address the studio can send or receive on — help@, quote@, " +
      "will@ and so on — with how many unread conversations each is holding.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const db = adminDb();
      const [boxes, threads] = await Promise.all([
        db.collection("mailboxes").get(),
        threadsFor(db, 300),
      ]);

      const unread = new Map<string, number>();
      for (const thread of threads) {
        if (!thread.unread || thread.archived || thread.status === "Closed") continue;
        const box = thread.mailbox ?? "help@wjohnstonmedia.com";
        unread.set(box, (unread.get(box) ?? 0) + 1);
      }

      return boxes.docs.map((d) => {
        const data = d.data();
        return {
          address: d.id,
          label: data.label ?? d.id,
          sendOnly: Boolean(data.sendOnly),
          personal: Boolean(data.personal),
          unread: unread.get(d.id) ?? 0,
        };
      });
    },
  },

  {
    name: "list_threads",
    description:
      "Conversations in the inbox, newest first. Filter by mailbox, by " +
      "whether they were received or sent, or by unread only. Use this " +
      "before read_thread — it returns ids, subjects and previews, not " +
      "whole messages.",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: "Only this address, e.g. quote@wjohnstonmedia.com.",
        },
        view: {
          type: "string",
          enum: ["inbox", "sent", "unread", "archived", "all"],
          description: "Defaults to inbox: received, not archived, not done.",
        },
        search: {
          type: "string",
          description: "Matches subject, sender and preview.",
        },
        limit: { type: "number", description: "1–50. Defaults to 20." },
      },
    },
    async handler(args) {
      const view = str(args.view) || "inbox";
      const mailbox = str(args.mailbox, 200).toLowerCase();
      const term = str(args.search, 200).toLowerCase();
      const limit = capped(args.limit, 20, 50);

      // Read wider than asked for, because the filtering happens here: a
      // query for 20 unread would otherwise return the 20 newest threads and
      // then show the two of them that were unread.
      const all = await threadsFor(adminDb(), 300);

      const matched = all
        .filter((t) => (mailbox ? t.mailbox === mailbox : true))
        .filter((t) => {
          if (view === "all") return true;
          if (view === "sent") return Boolean(t.hasOutbound) && !t.archived;
          if (view === "archived") return Boolean(t.archived);
          if (view === "unread") {
            return Boolean(t.unread) && received(t) && !t.archived;
          }
          return received(t) && !t.archived && t.status !== "Closed";
        })
        .filter(
          (t) =>
            !term ||
            t.subject?.toLowerCase().includes(term) ||
            t.fromEmail?.toLowerCase().includes(term) ||
            t.fromName?.toLowerCase().includes(term) ||
            t.snippet?.toLowerCase().includes(term),
        );

      return {
        total: matched.length,
        threads: matched.slice(0, limit).map(threadSummary),
      };
    },
  },

  {
    name: "read_thread",
    description:
      "The whole conversation: every message in order, who sent it, when, " +
      "and who was copied. Use it to answer questions about what was said, " +
      "or to summarise an exchange.",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "From list_threads." },
        markRead: {
          type: "boolean",
          description: "Mark the conversation read. Defaults to false.",
        },
      },
      required: ["threadId"],
    },
    async handler(args) {
      const threadId = str(args.threadId, 120);
      if (!threadId) throw new Error("Which conversation? Pass a threadId.");

      const db = adminDb();
      const ref = db.collection("helpThreads").doc(threadId);
      const snap = await ref.get();
      if (!snap.exists) throw new Error(`No conversation with id ${threadId}.`);

      const thread = { id: snap.id, ...snap.data() } as HelpThread;
      const messages = await ref
        .collection("messages")
        .orderBy("createdAt", "asc")
        .limit(50)
        .get();

      if (args.markRead === true && thread.unread) {
        await ref.update({ unread: false });
      }

      return {
        ...threadSummary(thread),
        messages: messages.docs.map((d) => {
          const m = d.data();
          // The HTML is how it looked; the text is what it said. An
          // assistant wants the words, so HTML-only mail is flattened
          // rather than handed over as markup.
          const body =
            (m.body as string) || htmlToText(m.html as string) || "";
          return {
            direction: m.direction,
            from: m.fromEmail,
            fromName: m.fromName ?? undefined,
            to: m.toEmail ?? undefined,
            cc: m.cc ?? undefined,
            sentBy: m.authorEmail ?? undefined,
            failed: m.failed === true ? true : undefined,
            at: m.createdAt,
            body: body.slice(0, 6000),
          };
        }),
      };
    },
  },

  {
    name: "send_email",
    description:
      "Sends an email from one of the studio's addresses and files it in " +
      "the inbox as a conversation. The message is plain text; it goes out " +
      "in the Johnston Media shell with the signature and logo. For a " +
      "reply to an existing conversation use reply_to_thread instead.",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "A studio address from list_mailboxes.",
        },
        to: {
          type: "array",
          items: { type: "string" },
          description: "Up to 10 recipients, all on one message.",
        },
        cc: { type: "array", items: { type: "string" } },
        bcc: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        message: {
          type: "string",
          description: "Plain text. Blank lines become paragraphs.",
        },
      },
      required: ["from", "to", "subject", "message"],
    },
    async handler(args) {
      const from = str(args.from, 200).toLowerCase();
      const to = addresses(args.to);
      const cc = addresses(args.cc).filter((a) => !to.includes(a));
      const bcc = addresses(args.bcc).filter(
        (a) => !to.includes(a) && !cc.includes(a),
      );
      const subject = str(args.subject, 300);
      const message = str(args.message, 20000);

      if (!EMAIL_RE.test(from)) throw new Error("Pick a valid from address.");
      if (to.length === 0) throw new Error("Add at least one recipient.");
      if (to.length + cc.length + bcc.length > 10) {
        throw new Error(
          "That is more than 10 recipients. A list that size is a campaign, " +
            "which has its own rules and is not sent from here.",
        );
      }
      if (!subject) throw new Error("The email needs a subject.");
      if (!message) throw new Error("The email is empty.");

      // The mailbox must exist. Sending as an address the domain does not
      // claim is how a provider ends up rejecting the whole send, and the
      // error it gives back is much less clear than this one.
      const box = await adminDb().collection("mailboxes").doc(from).get();
      if (!box.exists) {
        throw new Error(
          `${from} is not one of the studio's addresses. ` +
            "Call list_mailboxes to see them.",
        );
      }

      const result = await sendPlainMail({
        from,
        to,
        cc,
        bcc,
        subject,
        message,
        authorName: "Claude (MCP)",
      });

      if (!result.ok) {
        throw new Error(result.error ?? "The email did not send.");
      }

      return {
        sent: to.length + cc.length + bcc.length,
        threads: result.threadIds.map(
          (id) => `${SITE_URL}/email?section=inbox&thread=${id}`,
        ),
      };
    },
  },

  {
    name: "reply_to_thread",
    description:
      "Replies to a conversation from the address it arrived at, keeping it " +
      "as one thread in the other person's mail client. Optionally marks it " +
      "done.",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string" },
        message: { type: "string", description: "Plain text." },
        cc: { type: "array", items: { type: "string" } },
        bcc: { type: "array", items: { type: "string" } },
        close: {
          type: "boolean",
          description: "Mark the conversation done after replying.",
        },
      },
      required: ["threadId", "message"],
    },
    async handler(args) {
      const threadId = str(args.threadId, 120);
      const message = str(args.message, 20000);
      if (!threadId || !message) {
        throw new Error("A reply needs a conversation and some words.");
      }

      const db = adminDb();
      const ref = db.collection("helpThreads").doc(threadId);
      const snap = await ref.get();
      if (!snap.exists) throw new Error(`No conversation with id ${threadId}.`);

      const thread = { id: snap.id, ...snap.data() } as HelpThread;
      const from = thread.mailbox ?? "help@wjohnstonmedia.com";
      const subject = `Re: ${thread.subject}`;
      const cc = addresses(args.cc).filter((a) => a !== thread.fromEmail);
      const bcc = addresses(args.bcc).filter(
        (a) => a !== thread.fromEmail && !cc.includes(a),
      );

      const fromName = await nameFor(from);
      const html = plainShell(paragraphs(message), subject, {
        fromName,
        fromEmail: from,
        senderAddress:
          process.env.EMAIL_SENDER_ADDRESS ?? "New South Wales, Australia",
      });

      const key = process.env.RESEND_API_KEY;
      if (!key) throw new Error("RESEND_API_KEY is not set.");

      let error: string | undefined;
      let sent = false;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${fromName} <${from}>`,
            to: [thread.fromEmail],
            ...(cc.length ? { cc } : {}),
            ...(bcc.length ? { bcc } : {}),
            subject,
            reply_to: `${fromName} <${from}>`,
            text: message,
            html,
          }),
        });
        sent = response.ok;
        if (!sent) error = (await response.text()).slice(0, 300);
      } catch (err) {
        error = err instanceof Error ? err.message : "network error";
      }

      // Recorded either way: a reply that failed to send still has to be
      // visible, or the next person answers the same question twice.
      await ref.collection("messages").add({
        direction: "out",
        fromEmail: from,
        toEmail: thread.fromEmail,
        body: message,
        html,
        ...(cc.length ? { cc } : {}),
        ...(bcc.length ? { bcc } : {}),
        authorEmail: "mcp",
        createdAt: new Date().toISOString(),
        ...(sent ? {} : { failed: true }),
      });

      await ref.update({
        status: args.close === true ? "Closed" : "Waiting",
        unread: false,
        messageCount: (thread.messageCount ?? 0) + 1,
        hasOutbound: true,
        lastAuthorName: "Claude (MCP)",
        lastMessageAt: new Date().toISOString(),
      });

      if (!sent) throw new Error(error ?? "The reply did not send.");

      return {
        sent: true,
        thread: `${SITE_URL}/email?section=inbox&thread=${threadId}`,
      };
    },
  },

  {
    name: "update_thread",
    description:
      "Marks a conversation read or unread, archives it, stars it, or sets " +
      "its status — the same things the buttons in the inbox do.",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string" },
        unread: { type: "boolean" },
        archived: { type: "boolean" },
        starred: { type: "boolean" },
        status: { type: "string", enum: ["Open", "Waiting", "Closed"] },
      },
      required: ["threadId"],
    },
    async handler(args) {
      const threadId = str(args.threadId, 120);
      if (!threadId) throw new Error("Which conversation? Pass a threadId.");

      const patch: Record<string, unknown> = {};
      if (typeof args.unread === "boolean") patch.unread = args.unread;
      if (typeof args.archived === "boolean") patch.archived = args.archived;
      if (typeof args.starred === "boolean") patch.starred = args.starred;
      const status = str(args.status, 20);
      if (["Open", "Waiting", "Closed"].includes(status)) patch.status = status;

      if (Object.keys(patch).length === 0) {
        throw new Error("Nothing to change — pass at least one field.");
      }

      await adminDb().collection("helpThreads").doc(threadId).update(patch);
      return { updated: threadId, ...patch };
    },
  },

  {
    name: "list_quotes",
    description:
      "Quote requests from the website: who asked, for what, when, and " +
      "where it has got to — new, estimated, invoiced, paid.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Only this status." },
        limit: { type: "number", description: "1–50. Defaults to 20." },
      },
    },
    async handler(args) {
      const limit = capped(args.limit, 20, 50);
      const status = str(args.status, 40);

      const snap = await adminDb()
        .collection("quotes")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();

      return snap.docs
        .map((d) => {
          const q = d.data();
          return {
            id: d.id,
            client: q.clientName,
            email: q.clientEmail,
            phone: q.clientPhone ?? undefined,
            service: q.serviceType,
            name: q.name,
            date: q.date ?? undefined,
            location: q.location ?? undefined,
            budget: q.budget ?? undefined,
            details:
              typeof q.details === "string" ? q.details.slice(0, 600) : undefined,
            status: q.status,
            amount:
              typeof q.amountCents === "number"
                ? `$${(q.amountCents / 100).toFixed(2)}`
                : undefined,
            createdAt: q.createdAt,
          };
        })
        .filter((q) => !status || q.status === status)
        .slice(0, limit);
    },
  },

  {
    name: "list_projects",
    description:
      "Jobs in production: what stage each is at, which client it belongs " +
      "to, and when it last moved.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "1–50. Defaults to 20." },
      },
    },
    async handler(args) {
      const limit = capped(args.limit, 20, 50);
      const snap = await adminDb()
        .collection("projects")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      return snap.docs.map((d) => {
        const p = d.data();
        return {
          id: d.id,
          name: p.name,
          client: p.clientName,
          email: p.clientEmail ?? undefined,
          service: p.serviceType,
          stage: p.pipelineStage ?? undefined,
          status: p.status,
          files: Array.isArray(p.files) ? p.files.length : 0,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt ?? undefined,
        };
      });
    },
  },

  {
    name: "list_contacts",
    description:
      "The mailing list: who is on it, whether they confirmed, and whether " +
      "they have unsubscribed. Unsubscribed people are kept on record " +
      "because the Spam Act requires that choice to be remembered.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Matches name and email." },
        subscribedOnly: { type: "boolean" },
        limit: { type: "number", description: "1–100. Defaults to 25." },
      },
    },
    async handler(args) {
      const limit = capped(args.limit, 25, 100);
      const term = str(args.search, 200).toLowerCase();

      const snap = await adminDb().collection("contacts").limit(500).get();

      return snap.docs
        .map((d) => {
          const c = d.data();
          return {
            id: d.id,
            email: c.email,
            name: c.name ?? undefined,
            tags: c.tags ?? [],
            subscribed: c.subscribed !== false,
            confirmed: Boolean(c.consent?.confirmedAt),
            source: c.source ?? undefined,
          };
        })
        .filter((c) => (args.subscribedOnly === true ? c.subscribed : true))
        .filter(
          (c) =>
            !term ||
            c.email?.toLowerCase().includes(term) ||
            c.name?.toLowerCase().includes(term),
        )
        .slice(0, limit);
    },
  },

  {
    name: "studio_overview",
    description:
      "One call for 'what is happening': unread mail per address, the " +
      "conversations waiting on a reply, quote requests that have not been " +
      "answered, and jobs currently in production. Start here.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const db = adminDb();
      const [threads, quotes, projects] = await Promise.all([
        threadsFor(db, 300),
        db.collection("quotes").orderBy("createdAt", "desc").limit(50).get(),
        db.collection("projects").orderBy("createdAt", "desc").limit(50).get(),
      ]);

      const live = threads.filter(
        (t) => !t.archived && t.status !== "Closed" && received(t),
      );
      const unreadBy: Record<string, number> = {};
      for (const thread of live) {
        if (!thread.unread) continue;
        const box = thread.mailbox ?? "help@wjohnstonmedia.com";
        unreadBy[box] = (unreadBy[box] ?? 0) + 1;
      }

      const openQuotes = quotes.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>)
        .filter((q) => q.status === "new" || q.status === "New");

      return {
        unread: {
          total: live.filter((t) => t.unread).length,
          byMailbox: unreadBy,
        },
        // Someone wrote and nobody has answered: the one number that is
        // actually a to-do list.
        needsReply: live
          .filter((t) => t.status !== "Waiting")
          .slice(0, 10)
          .map(threadSummary),
        quotes: {
          unanswered: openQuotes.length,
          latest: openQuotes.slice(0, 5).map((q) => ({
            id: q.id,
            client: q.clientName,
            service: q.serviceType,
            createdAt: q.createdAt,
          })),
        },
        projects: {
          live: projects.docs.filter(
            (d) => d.data().status !== "Delivered" && d.data().status !== "Archived",
          ).length,
        },
      };
    },
  },
];

/** The shape the protocol wants: everything but the handler. */
export const TOOL_LIST = TOOLS.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}));

export function findTool(name: string): McpTool | undefined {
  return TOOLS.find((tool) => tool.name === name);
}
