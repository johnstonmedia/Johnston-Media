import { NextResponse } from "next/server";

import { verifyUnsubscribe } from "@/lib/broadcast";
import { adminDb } from "@/lib/firebaseAdmin";
import { SITE_URL } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe.
 *
 * Public and unauthenticated by necessity — the whole point is that somebody
 * can leave without an account, a login or a conversation. The signature is
 * what stops one person unsubscribing another.
 *
 * GET is the link in the email; POST is what Gmail and Outlook call when the
 * reader presses their native unsubscribe button (RFC 8058). Both do the same
 * thing, because a reader who has asked twice should not be subscribed once.
 */
async function unsubscribe(url: URL): Promise<{ ok: boolean; message: string }> {
  const contactId = url.searchParams.get("c") ?? "";
  const email = url.searchParams.get("e") ?? "";
  const sig = url.searchParams.get("s") ?? "";

  if (!contactId || !email || !sig) {
    return { ok: false, message: "That unsubscribe link is incomplete." };
  }

  if (!verifyUnsubscribe(contactId, email, sig)) {
    return { ok: false, message: "That unsubscribe link isn't valid." };
  }

  try {
    await adminDb()
      .collection("contacts")
      .doc(contactId)
      .set(
        {
          subscribed: false,
          unsubscribedAt: new Date().toISOString(),
        },
        { merge: true },
      );
  } catch (err) {
    console.error("[unsubscribe] write failed:", err);
    return {
      ok: false,
      message:
        "Something went wrong on our end. Reply to the email and we'll take you off by hand.",
    };
  }

  return {
    ok: true,
    message: "You're unsubscribed. You won't get marketing email from us again.",
  };
}

function page(message: string, ok: boolean): Response {
  // A plain, self-contained page: this is opened from an email client, which
  // may well strip anything clever, and it should work with no CSS at all.
  const html = `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${ok ? "Unsubscribed" : "Unsubscribe"} · Johnston Media</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;
       background:#0b0b0b;color:#e8e8e8;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}
  .card{max-width:30rem;text-align:center;background:#141414;
        border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:40px 32px}
  h1{margin:0 0 12px;font-size:1.35rem;font-weight:600;color:#fff}
  p{margin:0;line-height:1.7;color:#8a9aa6}
  a{display:inline-block;margin-top:24px;color:#f2c88d}
</style></head>
<body><div class="card">
  <h1>${ok ? "You're unsubscribed" : "We couldn't do that"}</h1>
  <p>${message}</p>
  <a href="${SITE_URL}">Johnston Media</a>
</div></body></html>`;

  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  const result = await unsubscribe(new URL(request.url));
  return page(result.message, result.ok);
}

export async function POST(request: Request) {
  const result = await unsubscribe(new URL(request.url));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
