// app/api/projects/[id]/tasks/[taskId]/route.ts
//
// Polled by the task accordion while status is pending or pipeline_running.
// Returns the full task with pipeline logs and recent runs.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params
  const task = await prisma.task.findUnique({
    where: {
      id: taskId,
      projectId: id, // scoped — can't access tasks across projects
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

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params

  const task = await prisma.task.findUnique({
    where: { id: taskId, projectId: id },
  })

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (task.status === 'approved') {
    return NextResponse.json({ error: 'Cannot delete an approved task' }, { status: 403 })
  }

  await prisma.task.delete({
    where: { id: taskId },
  })

  return NextResponse.json({ success: true })
}