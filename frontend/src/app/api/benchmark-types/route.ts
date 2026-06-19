// src/app/api/benchmark-types/route.ts
//
// GET — returns only active benchmark types, ordered by sortOrder.
// This is a public endpoint used by the ProjectTypeSelector.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const types = await prisma.benchmarkType.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true },
  });

  return NextResponse.json(types);
}