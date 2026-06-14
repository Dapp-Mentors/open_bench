import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const [
        totalTasks,
        approved,
        inPipeline,
        rejected,
        awaitingReview,
        totalRuns,
        activeRuns,
        avgQualityResult,
    ] = await Promise.all([
        prisma.task.count(),
        prisma.task.count({ where: { status: "approved" } }),
        prisma.task.count({ where: { status: "pipeline_running" } }),
        prisma.task.count({ where: { status: "rejected" } }),
        prisma.task.count({ where: { status: "pipeline_passed" } }),
        prisma.benchmarkRun.count(),
        prisma.benchmarkRun.count({ where: { status: "running" } }),
        prisma.task.aggregate({
            where: { status: "pipeline_passed" },
            _avg: { qualityScore: true },
        }),
    ]);

    const totalProcessed = approved + rejected;
    const passRate = totalProcessed > 0 ? approved / totalProcessed : 0;
    const avgQualityScore = avgQualityResult._avg.qualityScore ?? undefined;

    return NextResponse.json({
        totalTasks,
        approved,
        inPipeline,
        rejected,
        awaitingReview,
        passRate: Math.round(passRate * 1000) / 1000,
        totalRuns,
        activeRuns,
        avgQualityScore: avgQualityScore != null
            ? Math.round(avgQualityScore * 1000) / 1000
            : undefined,
    });
}