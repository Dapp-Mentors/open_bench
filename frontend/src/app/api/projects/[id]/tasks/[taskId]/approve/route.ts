// app/api/projects/[id]/tasks/[taskId]/approve/route.ts
// Flips a pipeline_passed task to approved and stamps approvedAt.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: projectId, taskId } = await params;

  const task = await prisma.task.findUnique({ where: { id: taskId } });

  if (!task || task.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (task.status !== "pipeline_passed") {
    return NextResponse.json(
      { error: `Task is "${task.status}", not "pipeline_passed" — cannot approve` },
      { status: 400 },
    );
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status:     "approved",
      approvedAt: new Date(),
    },
  });

  return NextResponse.json(updated);
}