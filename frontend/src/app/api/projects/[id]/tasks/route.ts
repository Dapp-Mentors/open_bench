// app/api/projects/[id]/tasks/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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
  // 1. Verify project exists
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
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

  // 3. Persist the zip to local storage
  //    In production swap this for S3/R2 upload and store the remote URL.
  const uploadDir = join(process.cwd(), 'uploads', id)
  await mkdir(uploadDir, { recursive: true })
  const fileName = `${randomUUID()}-${file.name}`
  const filePath = join(uploadDir, fileName)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  const title = file.name.replace(/\.zip$/, '')

  // 4. Create task record — status starts as "pending"
  const task = await prisma.task.create({
    data: {
      projectId: id,
      title,
      description: '', // pipeline will populate from instruction.md
      domain: domain.trim(),
      language: language.trim(),
      storagePath: filePath,
      status: 'pending',
      scoringType: 'passfail',
      timeoutMs: 120_000,
    },
  })

  // 5. Fire the Inngest pipeline event
  await inngest.send({
    name: 'pipeline/task.submitted',
    data: { taskId: task.id, projectId: id, storagePath: filePath },
  })

  return NextResponse.json({ id: task.id, title }, { status: 201 })
}
