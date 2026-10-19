import { NextResponse } from "next/server";

import { getEmailCaller } from "@/lib/emailAccess";
import { isPushConfigured, notifyUser } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pushes a test notification to the caller's own devices.
 *
 * Push has a long chain: VAPID keys on the server, a service worker
 * registered, permission granted, a subscription stored, and a push service
 * that will accept it. Until this existed the only thing that exercised any
 * of it was a real inbound email — which needs an MX record and a webhook on
 * top — so a silent phone could mean any one of seven things.
 *
 * This proves the first half on its own, and says exactly which part failed
 * when it doesn't.
 */
export async function POST(request: Request) {
  const caller = await getEmailCaller(request);
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Sign in to test notifications." },
      { status: 403 },
    );
  }

  if (!isPushConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The server has no VAPID keys, so it can't send a push. Check " +
          "NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel, " +
          "then redeploy.",
      },
      { status: 503 },
    );
  }

  const { sent, removed, devices } = await notifyUser(caller.uid, {
    title: "Johnston Media",
    body: "Test notification — if you can see this, push is working.",
    url: "/email",
    tag: "jm-test",
  });

  // Logged unconditionally. The failure mode here is a push the server
  // reports as sent and the device never shows, and without this the logs
  // say nothing at all about which of those two happened.
  console.log(
    `[push/test] uid=${caller.uid} devices=${devices} sent=${sent} removed=${removed}`,
  );

  if (devices === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This device isn't subscribed yet. Tick a mailbox above and save, " +
          "then try again.",
      },
      { status: 400 },
    );
  }

  if (sent === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          removed > 0
            ? "Your subscription had expired and has been cleared. Save again to re-subscribe."
            : "The push service refused it. The server logs carry its reason.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sent, devices, removed });
}
