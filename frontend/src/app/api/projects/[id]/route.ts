// app/api/projects/[id]/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// ─── GET /api/projects/[id] ───────────────────────────────────────────────────

export async function GET(_: Request, { params }: Params) {
  const session = await auth();
  const role = session?.user?.role;
  const isAdmin = role === "admin" || role === "super_admin";

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: { createdAt: "desc" },
        include: {
          pipelineLogs: { orderBy: { ts: "asc" } },
          runs: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Non-admin users only see tasks they submitted
  if (!isAdmin && session?.user?.id) {
    project.tasks = project.tasks.filter(
      (t) => t.submittedById === session.user.id
    );
  }

  return NextResponse.json(project);
}

// ─── PATCH /api/projects/[id] — admin only ────────────────────────────────────

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  const role = session?.user?.role;
  const isAdmin = role === "admin" || role === "super_admin";

  if (!session?.user || !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, description, domain, projectType, rules, tags } = body as {
    name?: string;
    description?: string;
    domain?: string;
    projectType?: string;
    rules?: string;
    tags?: string[];
  };

  // Only update fields that were actually sent
  const data: Record<string, string | string[]> = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof description === "string") data.description = description.trim();
  if (typeof domain === "string" && domain.trim()) data.domain = domain.trim();
  if (typeof projectType === "string" && projectType.trim()) data.projectType = projectType.trim();
  if (typeof rules === "string") data.rules = rules.trim();
  if (Array.isArray(tags)) data.tags = tags;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.project.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
}

// ─── DELETE /api/projects/[id] — admin only ───────────────────────────────────

export async function DELETE(_: Request, { params }: Params) {
  const session = await auth();
  const role = session?.user?.role;
  const isAdmin = role === "admin" || role === "super_admin";

  if (!session?.user || !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
}