// app/api/projects/[id]/tasks/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { inngest } from '@/lib/inngest/client'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { UPLOADS_DIR } from '@/lib/uploads'

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const tasks = await prisma.task.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'desc' },
    include: {
      pipelineLogs: { orderBy: { ts: 'asc' } },
      _count: { select: { runs: true } },
    },
  })

  return NextResponse.json(tasks)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // 1. Verify project exists and is not paused
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if (project.paused) {
    return NextResponse.json(
      { error: 'This project is paused. Task submission is disabled until the project is unpaused.' },
      { status: 409 },
    )
  }

  // 2. Parse form data
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const domain = formData.get('domain') as string | null
  const language = formData.get('language') as string | null

  if (!file || !domain?.trim() || !language?.trim()) {
    return NextResponse.json(
      { error: 'file, domain, and language are required' },
      { status: 400 },
    )
  }

  if (!file.name.endsWith('.zip')) {
    return NextResponse.json(
      { error: 'Only .zip files are accepted' },
      { status: 400 },
    )
  }

  // 3. Persist the zip to the shared uploads directory.
  const uploadDir = join(UPLOADS_DIR, id)
  await mkdir(uploadDir, { recursive: true })
  const fileName = `${randomUUID()}-${file.name}`
  const filePath = join(uploadDir, fileName)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  const title = file.name.replace(/\.zip$/, '')

  // 4. Get the authenticated user who is submitting the task
  const session = await auth()
  const submittedById = session?.user?.id ?? null

  // 5. Create task record — status starts as "pending"
  const task = await prisma.task.create({
    data: {
      projectId: id,
      title,
      description: '',
      domain: domain.trim(),
      language: language.trim(),
      storagePath: filePath,
      status: 'pending',
      scoringType: 'passfail',
      timeoutMs: 120_000,
      submittedById,
    },
  })

  // 6. Fire the Inngest pipeline event.
  //    If Inngest isn't reachable (e.g. running next dev outside Docker) we
  //    log the failure but still return 201 — the task record was created and
  //    can be manually re-queued or picked up once Inngest is running.
  try {
    await inngest.send({
      name: 'pipeline/task.submitted',
      data: { taskId: task.id, projectId: id, storagePath: filePath },
    })
  } catch (error) {
    console.error('[tasks] submission error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }

  return NextResponse.json({ id: task.id, title }, { status: 201 })
}