import { NextResponse } from "next/server";

import { sendProjectStageUpdate } from "@/lib/email";
import { adminDb, requireAdmin } from "@/lib/firebaseAdmin";
import {
  PIPELINE_STAGES,
  PRODUCTION_STAGES,
  type PipelineStage,
  type Project,
  type ProductionStage,
} from "@/lib/types";
import { clean } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only: move a project along the board, and tell the client about it.
 *
 * Two stages travel together on a project and both are set here:
 *
 *   pipelineStage — where the job sits on the Square Projects board
 *                   (Enquiry → Proposal → Booked → In progress → Complete).
 *                   Moved by hand to match what you did in Square, so the two
 *                   never drift apart. Silent: it's bookkeeping.
 *
 *   stage         — production detail Square doesn't track (Planning →
 *                   Shooting → Editing → Delivering → Delivered). This is the
 *                   one the client cares about, so it emails them.
 *
 * Send either or both. Going through the server rather than writing to
 * Firestore directly is what guarantees the notification actually fires.
 */
export async function POST(request: Request) {
  const caller = await requireAdmin(request);
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "Not authorised." },
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

  const projectId = clean(body.projectId, 120);
  const stage = clean(body.stage, 40) as ProductionStage | "";
  const pipelineStage = clean(body.pipelineStage, 40) as PipelineStage | "";
  const notify = body.notify !== false;

  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "Missing projectId." },
      { status: 400 },
    );
  }
  if (!stage && !pipelineStage) {
    return NextResponse.json(
      { ok: false, error: "Nothing to change." },
      { status: 400 },
    );
  }
  if (stage && !PRODUCTION_STAGES.includes(stage)) {
    return NextResponse.json(
      { ok: false, error: `Unknown stage "${stage}".` },
      { status: 400 },
    );
  }
  if (pipelineStage && !PIPELINE_STAGES.includes(pipelineStage)) {
    return NextResponse.json(
      { ok: false, error: `Unknown pipeline stage "${pipelineStage}".` },
      { status: 400 },
    );
  }

  const ref = adminDb().collection("projects").doc(projectId);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json(
      { ok: false, error: "Project not found." },
      { status: 404 },
    );
  }

  const project = { id: snap.id, ...snap.data() } as Project & {
    clientEmail?: string;
  };

  const stageChanged = Boolean(stage) && project.status !== stage;
  const pipelineChanged =
    Boolean(pipelineStage) && project.pipelineStage !== pipelineStage;

  if (!stageChanged && !pipelineChanged) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (stageChanged) update.status = stage;
  if (pipelineChanged) update.pipelineStage = pipelineStage;

  await ref.update(update);

  let emailed = false;

  // Only the production stage is worth an email — the pipeline stage mirrors
  // the Square board, and a client doesn't need a message every time a card
  // moves a column.
  if (notify && stageChanged) {
    // The project may only carry a clientId — look up the email if so.
    let clientEmail = project.clientEmail;
    if (!clientEmail && project.clientId) {
      const userSnap = await adminDb()
        .collection("users")
        .doc(project.clientId)
        .get();
      clientEmail = userSnap.data()?.email;
    }

    if (clientEmail) {
      const result = await sendProjectStageUpdate({
        clientName: project.clientName,
        clientEmail,
        projectName: project.name,
        stage: stage as ProductionStage,
      });
      emailed = result.ok;
    }
  }

  return NextResponse.json({
    ok: true,
    stage: stageChanged ? stage : undefined,
    pipelineStage: pipelineChanged ? pipelineStage : undefined,
    emailed,
  });
}
