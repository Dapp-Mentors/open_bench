// src/app/api/tasks/[id]/retry-difficulty/route.ts
//
// API endpoint to retry the difficulty probe stage for a task.
// Increments the retry counter and re-sends the pipeline/task.submitted
// event to Inngest so the pipeline restarts from the difficulty stage.
//
// Max retries is read from AppSettings DB (admin-managed), not an env var.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Read max retries from AppSettings DB table
    const settings = await prisma.appSettings.findUnique({
      where: { id: "default" },
      select: { difficultyMaxRetries: true },
    });
    const maxRetries = settings?.difficultyMaxRetries ?? 3;

    // Fetch the task with its project info
    const task = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        storagePath: true,
        status: true,
        difficultyRetries: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Only allow retry if the task is in "rejected" status
    if (task.status !== "rejected") {
      return NextResponse.json(
        { error: "Can only retry difficulty on rejected tasks" },
        { status: 400 },
      );
    }

    // Check retry limit
    if (task.difficultyRetries >= maxRetries) {
      return NextResponse.json(
        {
          error: `Max retries (${maxRetries}) reached for difficulty probe`,
          retriesUsed: task.difficultyRetries,
          maxRetries,
        },
        { status: 429 },
      );
    }

    // Clear old difficulty PipelineLog entries so the UI shows a fresh slate
    await prisma.pipelineLog.deleteMany({
      where: { taskId: task.id, stage: "difficulty" },
    });

    // Increment retry counter and reset status to pending
    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        difficultyRetries: { increment: 1 },
        status: "pending",
      },
      select: {
        id: true,
        status: true,
        difficultyRetries: true,
      },
    });

    // Log the retry attempt
    await prisma.pipelineLog.create({
      data: {
        taskId: task.id,
        stage: "difficulty",
        passed: null,
        message: `Difficulty retry #${updatedTask.difficultyRetries} initiated`,
      },
    });

    // Fire a difficulty-only retry event to Inngest (not the full pipeline)
    await inngest.send({
      name: "difficulty/retry.started",
      data: {
        taskId: task.id,
        projectId: task.projectId,
        storagePath: task.storagePath,
      },
    });

    return NextResponse.json({
      success: true,
      newStatus: updatedTask.status,
      retryAttempt: updatedTask.difficultyRetries,
      maxRetries,
      remainingRetries: maxRetries - updatedTask.difficultyRetries,
    });
  } catch (err) {
    console.error("[retry-difficulty] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}