// app/api/projects/[id]/tasks/[taskId]/route.ts
//
// Polled by the task accordion while status is pending or pipeline_running.
// Returns the full task with pipeline logs and recent runs.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _: Request,
  { params }: { params: { id: string; taskId: string } },
) {
  const task = await prisma.task.findUnique({
    where: {
      id: params.taskId,
      projectId: params.id, // scoped — can't access tasks across projects
    },
    include: {
      pipelineLogs: { orderBy: { ts: 'asc' } },
      runs: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          logs: {
            orderBy: { ts: 'asc' },
            take: 500, // cap log lines per run
          },
        },
      },
    },
  })

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(task)
}