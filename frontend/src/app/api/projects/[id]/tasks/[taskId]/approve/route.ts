// src/app/api/projects/[projectId]/tasks/[taskId]/approve/route.ts
//
// POST — trigger Sia upload for a pipeline_passed task.
//
// ⚠️ The task is NOT immediately marked as "approved".
//    Sia upload runs first (queued → uploading → pinning → ready).
//    Only when siaStatus reaches "ready" does the backend flip
//    task.status to "approved".
//
// This ensures the asset is shipped to Sia before being considered approved.
//
// The frontend subscribes to SSE at http://localhost:8000/api/sia/events
// for real-time status updates. When siaStatus="ready" is received, the
// admin-context triggers a data refresh so the UI updates.

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
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: projectId, taskId } = await params;

  // Look up the task to get its storagePath
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId },
    select: { id: true, status: true, siaStatus: true, storagePath: true },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Allow: pipeline_passed (first-time upload) or
  //        pipeline_passed + siaStatus=failed (retry)
  if (task.status === "approved" && task.siaStatus === "ready") {
    return NextResponse.json({
      ok: true,
      taskId,
      siaHash: null,
      siaStatus: "ready",
      message: "Already approved and uploaded to Sia",
    });
  }

  if (task.status !== "pipeline_passed") {
    return NextResponse.json(
      { error: `Task is in status "${task.status}", expected "pipeline_passed"` },
      { status: 409 },
    );
  }

  // Call the Python backend — it marks siaStatus="queued" + starts upload
  // in background. The response returns right away.
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