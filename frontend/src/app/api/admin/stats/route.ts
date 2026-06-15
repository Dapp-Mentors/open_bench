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
        // Sia push pipeline counts (approved OR pipeline_passed with active siaStatus)
        siaPending,
        siaQueued,
        siaUploading,
        siaPinning,
        siaReady,
        siaFailed,
        // pipeline_passed tasks that are mid-Sia-upload (not yet approved)
        siaUploadingUnapproved,
        siaPinningUnapproved,
        siaQueuedUnapproved,
        siaFailedUnapproved,
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
        // Sia pending: approved tasks waiting for Sia trigger
        prisma.task.count({ where: { status: "approved", siaStatus: "pending" } }),
        // Sia queued: approved OR pipeline_passed tasks queued for upload
        prisma.task.count({ where: { siaStatus: "queued" } }),
        // Sia uploading
        prisma.task.count({ where: { siaStatus: "uploading" } }),
        // Sia pinning
        prisma.task.count({ where: { siaStatus: "pinning" } }),
        // Sia ready
        prisma.task.count({ where: { status: "approved", siaStatus: "ready" } }),
        // Sia failed
        prisma.task.count({ where: { siaStatus: "failed" } }),
        // Breakout: pipeline_passed tasks mid-upload (not yet approved)
        prisma.task.count({ where: { status: "pipeline_passed", siaStatus: "uploading" } }),
        prisma.task.count({ where: { status: "pipeline_passed", siaStatus: "pinning" } }),
        prisma.task.count({ where: { status: "pipeline_passed", siaStatus: "queued" } }),
        prisma.task.count({ where: { status: "pipeline_passed", siaStatus: "failed" } }),
    ]);

    const totalProcessed = approved + rejected;
    const passRate = totalProcessed > 0 ? approved / totalProcessed : 0;
    const avgQualityScore = avgQualityResult._avg.qualityScore ?? undefined;

    // Total sia-relevant tasks = approved + pipeline_passed with active uploads
    const siaTotalApproved = approved;
    const siaTasksInFlight = siaQueuedUnapproved + siaUploadingUnapproved + siaPinningUnapproved + siaFailedUnapproved;
    const siaTotal = siaTotalApproved + siaTasksInFlight;

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
        sia: {
            pending: siaPending,
            queued: siaQueued,
            uploading: siaUploading,
            pinning: siaPinning,
            ready: siaReady,
            failed: siaFailed,
            total: siaTotal,
        },
    });
}