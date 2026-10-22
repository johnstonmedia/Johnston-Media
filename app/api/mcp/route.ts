import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { findTool, TOOL_LIST } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP — the studio, as something an assistant can talk to.
 *
 * Model Context Protocol is JSON-RPC over HTTP: a client posts
 * {"method":"tools/list"}, gets a list of what this server can do, then posts
 * {"method":"tools/call"} to do one. Point Claude at this URL and it can read
 * the inbox, answer an email, look up a quote and say what is waiting — the
 * same things the mail platform does, without a browser.
 *
 * Written by hand rather than with the SDK. The protocol surface a server
 * this size actually uses is five methods, and the one previous dependency
 * that reached into the server runtime took production down for an afternoon
 * — this is a route handler with no new packages behind it.
 *
 * ── Authentication ──
 * One bearer token, set as MCP_TOKEN. Not OAuth, deliberately: a single
 * person connecting their own site does not need an authorisation server,
 * and three moving parts that can each be misconfigured is worse security
 * than one that cannot. What matters is that the token IS the mailbox —
 * anyone holding it can read and send mail as the business — so it belongs
 * in the client's config file and nowhere else, and rotating it is a matter
 * of changing one environment variable.
 */

const TOKEN = process.env.MCP_TOKEN;

/** The protocol revisions this server knows how to answer. */
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST = VERSIONS[0];

const SERVER = {
  name: "johnston-media",
  title: "Johnston Media",
  version: "1.0.0",
};

/** Browser clients preflight before they will post anything. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Accept",
  "Access-Control-Expose-Headers": "MCP-Session-Id, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

function sameToken(given: string): boolean {
  if (!TOKEN) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorised(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? sameToken(match[1].trim()) : false;
}

interface Rpc {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function result(id: Rpc["id"], value: unknown) {
  return { jsonrpc: "2.0", id, result: value };
}

function failure(id: Rpc["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Answers one JSON-RPC message.
 *
 * Returns null for a notification — a message with no id, which the protocol
 * says must not be answered at all.
 */
async function handle(message: Rpc): Promise<object | null> {
  const { id, method, params } = message;

  switch (method) {
    case "initialize": {
      // Agree on a version: theirs if this server knows it, otherwise the
      // newest one here and let the client decide whether it can live with
      // that. Saying nothing and assuming is how two sides end up disagreeing
      // about the shape of a field.
      const asked = String(params?.protocolVersion ?? "");
      return result(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : LATEST,
        // Only tools. No resources, no prompts, no sampling — advertising a
        // capability this server does not have earns a client calling it.
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions:
          "Johnston Media is a photography, videography, aerial media and " +
          "web development studio in Sydney. These tools read and answer its " +
          "mail and look up its quotes and jobs. Start with studio_overview " +
          "for what is waiting, list_threads then read_thread to read, and " +
          "reply_to_thread to answer. Mail sent through these tools goes out " +
          "as the business — say what you are about to send before sending it.",
      });
    }

    // A notification. Acknowledged by saying nothing, which is the protocol.
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, { tools: TOOL_LIST });

    case "tools/call": {
      const name = String(params?.name ?? "");
      const tool = findTool(name);
      if (!tool) {
        return failure(id, -32602, `No tool called "${name}".`);
      }

      const args = (params?.arguments ?? {}) as Record<string, unknown>;

      try {
        const value = await tool.handler(args);
        return result(id, {
          // Text, because every client can render it and JSON is what the
          // model is going to read anyway.
          content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
        });
      } catch (err) {
        // A tool that fails is a result, not a transport error: the model
        // should see what went wrong and be able to try something else,
        // rather than the conversation ending in a protocol fault.
        const detail = err instanceof Error ? err.message : "Something failed.";
        console.error(`[mcp] ${name} failed:`, err);
        return result(id, {
          content: [{ type: "text", text: detail }],
          isError: true,
        });
      }
    }

    // Answered rather than refused, because some clients ask regardless of
    // what was advertised, and an error here looks like a broken server.
    case "resources/list":
      return result(id, { resources: [] });
    case "resources/templates/list":
      return result(id, { resourceTemplates: [] });
    case "prompts/list":
      return result(id, { prompts: [] });

    default:
      return failure(id, -32601, `Unknown method "${method}".`);
  }
}

export async function POST(request: Request) {
  if (!TOKEN) {
    console.error("[mcp] MCP_TOKEN is not set — refusing every request.");
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message:
            "This server has no MCP_TOKEN set, so it refuses every request. " +
            "Set one in Vercel and redeploy.",
        },
      },
      { status: 503, headers: CORS },
    );
  }

  if (!authorised(request)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: "Not authorised." },
      },
      {
        status: 401,
        headers: { ...CORS, "WWW-Authenticate": "Bearer" },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error." },
      },
      { status: 400, headers: CORS },
    );
  }

  // A client may send several messages in one array.
  if (Array.isArray(body)) {
    const answers = (
      await Promise.all(body.map((entry) => handle(entry as Rpc)))
    ).filter(Boolean);

    // All notifications: nothing to say, and 202 is how the protocol says it.
    if (answers.length === 0) {
      return new NextResponse(null, { status: 202, headers: CORS });
    }
    return NextResponse.json(answers, { headers: CORS });
  }

  const answer = await handle(body as Rpc);
  if (!answer) {
    return new NextResponse(null, { status: 202, headers: CORS });
  }

  return NextResponse.json(answer, { headers: CORS });
}

/**
 * The transport also allows a client to open a stream for messages the
 * server starts. This one never does — every answer comes back on the POST
 * that asked — so the honest reply is "that method is not supported here".
 */
export function GET() {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32601,
        message:
          "This server does not open server-sent streams; post JSON-RPC instead.",
      },
    },
    { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } },
  );
}

/** Session teardown. There is no session state to tear down, so: fine. */
export function DELETE() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
