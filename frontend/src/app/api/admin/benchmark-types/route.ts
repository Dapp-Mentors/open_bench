// src/app/api/admin/benchmark-types/route.ts
//
// GET    — list all benchmark types (active + inactive)
// POST   — create a new benchmark type
// PATCH  — toggle active status or update label/sortOrder
// DELETE — permanently delete a benchmark type

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  const isAdmin = role === "admin" || role === "super_admin";

  if (!session?.user || !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const types = await prisma.benchmarkType.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(types);
}

// ─── POST — create a new type ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  const isSuperAdmin = role === "super_admin";

  if (!session?.user || !isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, label, sortOrder } = body;

  if (!id?.trim() || !label?.trim()) {
    return NextResponse.json(
      { error: "id and label are required" },
      { status: 400 },
    );
  }

  // Get max sortOrder if not provided
  let order = sortOrder;
  if (order == null) {
    const max = await prisma.benchmarkType.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    order = (max?.sortOrder ?? 0) + 1;
  }

  try {
    const type = await prisma.benchmarkType.create({
      data: {
        id: id.trim(),
        label: label.trim(),
        sortOrder: order,
      },
    });
    return NextResponse.json(type, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "A benchmark type with this ID already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

// ─── PATCH — update a type ───────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  const isSuperAdmin = role === "super_admin";

  if (!session?.user || !isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, label, active, sortOrder } = body;

  if (!id?.trim()) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data: Record<string, any> = {};
  if (typeof label === "string" && label.trim()) data.label = label.trim();
  if (typeof active === "boolean") data.active = active;
  if (typeof sortOrder === "number") data.sortOrder = sortOrder;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.benchmarkType.update({
      where: { id: id.trim() },
      data,
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

// ─── DELETE — permanently remove a type ──────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  const isSuperAdmin = role === "super_admin";

  if (!session?.user || !isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id?.trim()) {
    return NextResponse.json(
      { error: "id query parameter is required" },
      { status: 400 },
    );
  }

  try {
    await prisma.benchmarkType.delete({
      where: { id: id.trim() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
