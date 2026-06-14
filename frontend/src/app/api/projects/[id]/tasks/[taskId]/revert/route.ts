// app/api/projects/[id]/tasks/[taskId]/revert/route.ts
// Reverts an approved or rejected task back to pipeline_passed.

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

  if (task.status !== "approved" && task.status !== "rejected") {
    return NextResponse.json(
      { error: `Task is "${task.status}" — can only revert "approved" or "rejected" tasks` },
      { status: 400 },
    );
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "pipeline_passed",
      approvedAt: null,
    },
  });

  return NextResponse.json(updated);
}