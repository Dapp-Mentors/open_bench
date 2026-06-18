// src/app/api/projects/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  const role = session?.user?.role
  const isAdmin = role === 'admin' || role === 'super_admin'

  // Admins see all projects; regular users see only projects they're members of
  const where = isAdmin
    ? {}
    : { members: { some: { userId: session?.user?.id } } }

  const projects = await prisma.project.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true } },
    },
  })

  // Shape into ProjectSummary — compute sub-counts from the task list
  const shaped = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    domain: p.domain,
    projectType: p.projectType,
    tags: p.tags,
    createdAt: p.createdAt,
    _count: {
      tasks: p._count.tasks,
      approvedTasks: p.tasks.filter((t) => t.status === 'approved').length,
      pendingTasks: p.tasks.filter(
        (t) => t.status === 'pending' || t.status === 'pipeline_running',
      ).length,
      rejectedTasks: p.tasks.filter((t) => t.status === 'rejected').length,
    },
  }))

  return NextResponse.json(shaped)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { name, description, domain, projectType, rules, tags } = body

  if (!name?.trim() || !description?.trim() || !domain?.trim()) {
    return NextResponse.json(
      { error: 'name, description, and domain are required' },
      { status: 400 },
    )
  }

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      description: description.trim(),
      domain: domain.trim(),
      projectType: projectType?.trim() || 'coding_benchmark',
      rules: rules?.trim() || '',
      tags: Array.isArray(tags) ? tags : [],
      members: {
        create: {
          userId: session.user.id,
          role: 'manager',
        },
      },
    },
  })

  return NextResponse.json({ id: project.id }, { status: 201 })
}