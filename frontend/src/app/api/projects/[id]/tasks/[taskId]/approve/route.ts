// src/app/api/projects/[projectId]/tasks/[taskId]/approve/route.ts
//
// POST — approve a pipeline-passed task.
//
// Simplified: Sia upload is now part of the pipeline (stage 9), so approval
// just flips the task status to "approved" directly without waiting for
// any background Sia process.

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
    select: { id: true, status: true, siaStatus: true, siaHash: true },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status === "approved") {
    return NextResponse.json({
      ok: true,
      taskId,
      siaHash: task.siaHash,
      siaStatus: task.siaStatus ?? "pending",
      message: "Already approved",
    });
  }

  if (task.status !== "pipeline_passed") {
    return NextResponse.json(
      { error: `Task is in status "${task.status}", expected "pipeline_passed"` },
      { status: 409 },
    );
  }

  // Call the Python backend to mark as approved (no Sia upload — that's done)
  const backendUrl = resolveBackendUrl();
  const res = await fetch(`${backendUrl}/api/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId }),
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
    siaStatus: data.siaStatus ?? "pending",
  });
}