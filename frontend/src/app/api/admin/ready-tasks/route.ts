// app/api/admin/ready-tasks/route.ts
// Returns tasks filtered by status query param, or all tasks if no status is provided.
// No auth gate for now — access control will be added later.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where = status ? { status } : {};

    const tasks = await prisma.task.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: {
            pipelineLogs: { orderBy: { ts: "asc" } },
        },
    });

    return NextResponse.json(tasks);
}