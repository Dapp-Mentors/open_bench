// app/api/projects/[id]/tasks/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { inngest } from '@/lib/inngest/client'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

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

  // 3. Persist the zip to the shared /uploads volume.
  //
  //    IMPORTANT: We use the hard-coded /uploads path instead of
  //    join(process.cwd(), 'uploads', …).  In Docker the frontend
  //    container mounts the task_uploads volume at  /uploads  and
  //    the backend container mounts the same volume at  /uploads.
  //
  //    Next.js standalone mode changes process.cwd() to
  //    /app/.next/standalone so join(process.cwd(), 'uploads', …)
  //    would produce a CONTAINER-LOCAL path that the backend cannot
  //    see.  Writing to /uploads guarantees both services can reach
  //    the same file through the shared volume.
  //
  //    When running outside Docker (e.g. `next dev`) /uploads falls
  //    back to a regular filesystem path; adjust your local dev
  //    environment accordingly or symlink /uploads to a local dir.
  //
  const uploadDir = join('/uploads', id)
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
  } catch (err) {
    console.error('[inngest] Failed to send pipeline/task.submitted:', err)
  }

  return NextResponse.json({ id: task.id, title }, { status: 201 })
}