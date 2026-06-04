// app/api/projects/[id]/tasks/[taskId]/approve/route.ts
//
// ADMIN ONLY — flips a task from "pipeline_passed" → "approved".
// The pipeline itself never sets "approved"; it only sets "pipeline_passed"
// once all 8 automated stages clear. A human reviewer must hit this endpoint.
//
// Access control is left as a TODO stub — wire in your auth provider
// (NextAuth, Clerk, etc.) and check for an admin role before proceeding.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params
  // ── TODO: admin gate ────────────────────────────────────────────────────────
  // const session = await getServerSession(authOptions);
  // if (!session || session.user.role !== "admin") {
  //   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // }
  // ────────────────────────────────────────────────────────────────────────────

  const task = await prisma.task.findUnique({
    where: { id: taskId, projectId: id },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.status !== 'pipeline_passed') {
    return NextResponse.json(
      {
        error: 'Task must complete the full pipeline before it can be approved',
        status: task.status,
      },
      { status: 409 },
    )
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { status: 'approved', approvedAt: new Date() },
  })

  return NextResponse.json(updated)
}

// ── Reject endpoint lives next to approve ────────────────────────────────────
// app/api/projects/[id]/tasks/[taskId]/reject/route.ts  (same pattern)
//
// export async function POST(...) {
//   // admin gate ...
//   const task = await prisma.task.findUnique({ ... });
//   if (task.status !== "pipeline_passed") { ... }
//   const updated = await prisma.task.update({
//     where: { id: params.taskId },
//     data:  { status: "rejected" },
//   });
//   return NextResponse.json(updated);
// }