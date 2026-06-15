// src/app/api/projects/[projectId]/tasks/[taskId]/approve/route.ts
//
// POST — approve a pipeline_passed task.
//
// Delegates to the Python backend which:
//   1. Sets task status → "approved" and siaStatus → "queued" immediately
//   2. Starts the Sia upload pipeline in a background task:
//        queued → uploading → pinning → ready (or failed)
//   3. Returns immediately so the frontend can poll siaStatus
//
// The admin page polls GET /api/admin/stats and GET /api/admin/ready-tasks
// every few seconds, so the SiaPipelineAccordion will show real-time progress.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Helper: resolve backend URL ───────────────────────────────────────────────
function resolveBackendUrl(): string {
  const url = process.env.BACKEND_URL ?? "http://backend:8000";
  if (process.env.RUNNING_IN_DOCKER === "1") return url;
  return url.replace("http://backend:", "http://localhost:");
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; taskId: string }> },
) {
  const { projectId, taskId } = await params;

  // Look up the task to get its storagePath
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId },
    select: { id: true, status: true, storagePath: true },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "pipeline_passed") {
    return NextResponse.json(
      { error: `Task is in status "${task.status}", expected "pipeline_passed"` },
      { status: 409 },
    );
  }

  // Call the Python backend — it marks approved immediately + starts Sia upload
  // in background. The response returns right away with siaStatus="queued".
  const backendUrl = resolveBackendUrl();
  const res = await fetch(`${backendUrl}/api/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, storagePath: task.storagePath }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    console.error(`[approve] Backend /api/approve returned ${res.status}: ${text}`);
    return NextResponse.json(
      { error: `Backend approval failed: ${text}` },
      { status: res.status },
    );
  }

  const data = await res.json();

  return NextResponse.json({
    ok: true,
    taskId: data.taskId,
    siaHash: data.siaHash ?? null,
    siaStatus: data.siaStatus ?? "queued",
  });
}