// app/api/projects/[id]/tasks/[taskId]/runs/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { inngest } from '@/lib/inngest/client'

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { taskId } = await params
  const runs = await prisma.benchmarkRun.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    include: {
      logs: { orderBy: { ts: 'asc' }, take: 500 },
    },
  })

  return NextResponse.json(runs)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params
  const body = await req.json().catch(() => ({}))
  const { agentConfig } = body

  if (!agentConfig?.provider || !agentConfig?.modelId) {
    return NextResponse.json(
      { error: 'agentConfig with provider and modelId is required' },
      { status: 400 },
    )
  }

  // Task must be approved before it can be run
  const task = await prisma.task.findUnique({
    where: { id: taskId, projectId: id },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.status !== 'approved') {
    return NextResponse.json(
      {
        error: 'Only approved tasks can be run',
        taskStatus: task.status,
      },
      { status: 409 },
    )
  }

  // Create the run record
  const run = await prisma.benchmarkRun.create({
    data: {
      taskId,
      projectId: id,
      provider: agentConfig.provider,
      modelId: agentConfig.modelId,
      status: 'running',
    },
  })

  // Fire Inngest — the benchmark runner picks this up
  await inngest.send({
    name: 'benchmark/run.started',
    data: {
      runId: run.id,
      taskId,
      projectId: id,
      storagePath: task.storagePath,
      agentConfig,
    },
  })

  return NextResponse.json({ runId: run.id }, { status: 201 })
}