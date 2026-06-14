// app/api/admin/ready-tasks/route.ts
// Returns all tasks with status "pipeline_passed" across every project.
// No auth gate for now — access control will be added later.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const tasks = await prisma.task.findMany({
        where: { status: "pipeline_passed" },
        orderBy: { updatedAt: "desc" },
        include: {
            pipelineLogs: { orderBy: { ts: "asc" } },
        },
    });

    return NextResponse.json(tasks);
}