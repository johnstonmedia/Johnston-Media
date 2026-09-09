import { NextResponse } from "next/server";

import {
  renderForContact,
  sendBatch,
  validateCampaign,
} from "@/lib/broadcast";
import { canSendAs, recipientCeiling, requireEmailLevel } from "@/lib/emailAccess";
import type {
  Audience,
  Campaign,
  Contact,
  EmailTemplate,
} from "@/lib/emailTypes";
import { adminDb } from "@/lib/firebaseAdmin";
import { clean } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A large send needs more than the default execution window. */
export const maxDuration = 300;

const SENDER_ADDRESS =
  process.env.EMAIL_SENDER_ADDRESS ?? "New South Wales, Australia";

/**
 * Sends a campaign.
 *
 * The order here is deliberate: every check that can refuse the send happens
 * before a single message leaves, because there is no recalling an email. Once
 * sending starts the campaign is marked Sending, so a second request can't
 * start it again while the first is still going.
 */
export async function POST(request: Request) {
  const caller = await requireEmailLevel(request, "send");
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "You don't have permission to send." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const campaignId = clean(body.campaignId, 120);
  const testOnly = body.test === true;
  const testTo = clean(body.testTo, 200);

  if (!campaignId) {
    return NextResponse.json(
      { ok: false, error: "Missing campaignId." },
      { status: 400 },
    );
  }

  const db = adminDb();
  const ref = db.collection("campaigns").doc(campaignId);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json(
      { ok: false, error: "Campaign not found." },
      { status: 404 },
    );
  }

  const campaign = { id: snap.id, ...snap.data() } as Campaign;

  if (!testOnly && campaign.status !== "Draft" && campaign.status !== "Scheduled") {
    return NextResponse.json(
      {
        ok: false,
        error: `This campaign is already ${campaign.status.toLowerCase()}.`,
      },
      { status: 409 },
    );
  }

  if (!canSendAs(caller, campaign.fromEmail)) {
    return NextResponse.json(
      {
        ok: false,
        error: `You're not allowed to send as ${campaign.fromEmail}.`,
      },
      { status: 403 },
    );
  }

  // Template, if the campaign uses one.
  let template: EmailTemplate | null = null;
  if (campaign.templateId) {
    const tpl = await db
      .collection("emailTemplates")
      .doc(campaign.templateId)
      .get();
    if (tpl.exists) {
      template = { id: tpl.id, ...tpl.data() } as EmailTemplate;
    }
  }

  const problem = validateCampaign(campaign, template);
  if (problem) {
    return NextResponse.json({ ok: false, error: problem }, { status: 400 });
  }

  const from = `${campaign.fromName} <${campaign.fromEmail}>`;

  // ── A test goes to one address and touches nothing else ──
  if (testOnly) {
    const to = testTo || caller.email;
    const preview: Contact = {
      id: "preview",
      email: to,
      name: caller.access.name ?? "there",
      tags: [],
      subscribed: true,
      createdAt: new Date().toISOString(),
    };
    const rendered = renderForContact(campaign, preview, template, SENDER_ADDRESS);
    const outcome = await sendBatch([rendered], from, campaign.replyTo);

    return NextResponse.json({
      ok: outcome.sent > 0,
      test: true,
      to,
      error: outcome.errors[0],
    });
  }

  // ── The real thing ──
  if (!caller.access.canBroadcast && caller.access.level !== "admin") {
    return NextResponse.json(
      { ok: false, error: "You're not allowed to send to an audience." },
      { status: 403 },
    );
  }

  // Resolve the audience to actual, still-subscribed people.
  let audience: Audience | null = null;
  if (campaign.audienceId) {
    const aud = await db.collection("audiences").doc(campaign.audienceId).get();
    if (aud.exists) audience = { id: aud.id, ...aud.data() } as Audience;
  }

  const contactSnap = await db
    .collection("contacts")
    .where("subscribed", "==", true)
    .get();

  const all = contactSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as Contact,
  );

  const wanted = audience?.tags.length
    ? all.filter((c) => audience!.tags.every((tag) => c.tags?.includes(tag)))
    : all;

  // A hard bounce means the address is gone. Sending again hurts the domain.
  const recipients = wanted.filter((c) => !c.bounced);
  const skipped = wanted.length - recipients.length;

  if (recipients.length === 0) {
    return NextResponse.json(
      { ok: false, error: "That audience has nobody in it." },
      { status: 400 },
    );
  }

  const ceiling = recipientCeiling(caller);
  if (recipients.length > ceiling) {
    return NextResponse.json(
      {
        ok: false,
        error: `That's ${recipients.length} recipients and your limit is ${ceiling}. Ask an admin to raise it.`,
      },
      { status: 403 },
    );
  }

  // Claim the campaign before sending, so a double-click can't double-send.
  await ref.update({
    status: "Sending",
    updatedAt: new Date().toISOString(),
  });

  const emails = recipients.map((contact) =>
    renderForContact(campaign, contact, template, SENDER_ADDRESS),
  );
  const outcome = await sendBatch(emails, from, campaign.replyTo);

  const stats = {
    recipients: recipients.length,
    sent: outcome.sent,
    failed: outcome.failed,
    skipped,
  };

  await ref.update({
    status: outcome.sent > 0 ? "Sent" : "Failed",
    stats,
    sentAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(outcome.errors.length
      ? { lastError: outcome.errors.slice(0, 3).join(" · ") }
      : {}),
  });

  return NextResponse.json({
    ok: outcome.sent > 0,
    stats,
    errors: outcome.errors.slice(0, 3),
  });
}
