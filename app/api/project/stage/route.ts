import { NextResponse } from "next/server";

import { sendProjectStageUpdate } from "@/lib/email";
import { adminDb, requireAdmin } from "@/lib/firebaseAdmin";
import { PROJECT_STAGES, type Project, type ProjectStage } from "@/lib/types";
import { clean } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only: move a project to a new stage and tell the client about it.
 *
 * Goes through the server rather than a direct Firestore write so the
 * notification email is guaranteed to fire with the stage change.
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
  const stage = clean(body.stage, 40) as ProjectStage;
  const notify = body.notify !== false;

  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "Missing projectId." },
      { status: 400 },
    );
  }
  if (!PROJECT_STAGES.includes(stage)) {
    return NextResponse.json(
      { ok: false, error: `Unknown stage "${stage}".` },
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

  if (project.status === stage) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await ref.update({
    status: stage,
    updatedAt: new Date().toISOString(),
  });

  let emailed = false;

  if (notify) {
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
        stage,
      });
      emailed = result.ok;
    }
  }

  return NextResponse.json({ ok: true, stage, emailed });
}
