// lib/inngest/pipeline-inngest.ts
//
// Inngest function that runs all 9 pipeline stages sequentially.
//
// Stages wired to the Python backend (all real, no stubs):
//   similarity    — embedding + cosine compare vs approved tasks
//   ci            — syntax checks + Docker build
//   quality       — LLM-as-judge across 11 criteria (avg >= 0.6)
//   preflight     — pytest --collect-only inside the built image (>= 6 tests)
//   oracle_nop    — NOP reward=0 + Oracle reward=1 container validation
//   easiness      — oracle run ×5; exactly 1/5 must pass
//   difficulty    — oracle run ×5; 1–3/5 must pass
//   agent_quality — LLM-as-judge on instruction realism + no leaked assertions
//   sia_upload    — Upload to Sia decentralized storage network
//
// If any stage fails, the task is marked "rejected" and the function stops.
// If all 9 pass, the task moves to "pipeline_passed" — awaiting human approval.
//
// ── Watchdog processes ─────────────────────────────────────────────────────────
// This file also defines two cron-based watchdog functions:
//
//   1. pipeline-watchdog — Midwife for stuck pipeline processes.
//      Runs every 5 minutes. Detects tasks stuck in "pipeline_running" for
//      longer than the grace period (30 min). If the Inngest run is no longer
//      active, it re-queues the task. If stuck > 2 hours, marks as rejected.
//
//   2. cleanup-watchdog — Periodic cleanup of rejected task files.
//      Runs every hour. Deletes local ZIP files for tasks rejected > 24 hours
//      ago. Only pipeline_passed / approved tasks keep their assets on Sia.

import { inngest } from './client'
import { prisma } from '@/lib/prisma'
import { unlink, rm } from 'fs/promises'
import { existsSync } from 'fs'

const STAGES = [
  'similarity',
  'ci',
  'quality',
  'preflight',
  'oracle_nop',
  'easiness',
  'difficulty',
  'agent_quality',
  'sia_upload',
] as const

type StageKey = (typeof STAGES)[number]

// ── Constants ──────────────────────────────────────────────────────────────────
const PIPELINE_STUCK_GRACE_MS = 30 * 60 * 1000   // 30 minutes before re-queue
const PIPELINE_DEADLINE_MS    = 2 * 60 * 60 * 1000 // 2 hours before forced reject
const CLEANUP_AGE_MS          = 24 * 60 * 60 * 1000 // 24 hours before cleanup
const WATCHDOG_BATCH_SIZE     = 50                  // max tasks to process per run

// ── Helper: resolve backend URL ───────────────────────────────────────────────
function resolveBackendUrl(): string {
  const url = process.env.BACKEND_URL ?? 'http://backend:8000'
  if (process.env.RUNNING_IN_DOCKER === '1') return url
  return url.replace('http://backend:', 'http://localhost:')
}

// ── Helper: write a PipelineLog row ──────────────────────────────────────────
async function logStage(
  taskId: string,
  stage: StageKey,
  passed: boolean,
  message: string,
) {
  await prisma.pipelineLog.create({
    data: { taskId, stage, passed, message },
  })
}

// ── Helper: call a backend pipeline stage endpoint ────────────────────────────
async function callBackend(
  endpoint: string,
  taskId: string,
  storagePath: string,
): Promise<{ passed: boolean; message: string; detail?: string }> {
  const backendUrl = resolveBackendUrl()
  const res = await fetch(`${backendUrl}/api/pipeline/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, storagePath }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Backend /${endpoint} returned ${res.status}: ${text}`)
  }

  return res.json()
}

// ── The Inngest pipeline function ─────────────────────────────────────────────
export const runPipeline = inngest.createFunction(
  { id: 'pipeline-run', name: 'Run curation pipeline' },
  { event: 'pipeline/task.submitted' },

  async ({ event, step }) => {
    const { taskId, projectId, storagePath } = event.data

    // Mark as running
    await step.run('mark-running', async () => {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'pipeline_running' },
      })
    })

    // ── Stage 1: Similarity & Diversity ───────────────────────────────────────
    const similarityPassed = await step.run('stage-similarity', async () => {
      const result = await callBackend('similarity', taskId, storagePath)
      await logStage(taskId, 'similarity', result.passed, result.message)
      return result.passed
    })
    if (!similarityPassed)
      return await reject(taskId, 'Rejected at similarity check')

    // ── Stage 2: CI Checks ────────────────────────────────────────────────────
    const ciPassed = await step.run('stage-ci', async () => {
      const result = await callBackend('ci', taskId, storagePath)
      await logStage(taskId, 'ci', result.passed, result.message)
      return result.passed
    })
    if (!ciPassed) return await reject(taskId, 'Rejected at CI checks')

    // ── Stage 3: Quality Check ────────────────────────────────────────────────
    // LLM-as-judge across 11 criteria. Full breakdown stored server-side on
    // Task.qualityDetails; only the summary line is logged here.
    const qualityPassed = await step.run('stage-quality', async () => {
      const result = await callBackend('quality', taskId, storagePath)
      const summaryLine = result.message.split('\n')[0]
      await logStage(taskId, 'quality', result.passed, summaryLine)
      return result.passed
    })
    if (!qualityPassed) return await reject(taskId, 'Rejected at quality check')

    // ── Stage 4: Validation pre-flight ───────────────────────────────────────
    const preflightPassed = await step.run('stage-preflight', async () => {
      const result = await callBackend('preflight', taskId, storagePath)
      await logStage(taskId, 'preflight', result.passed, result.message)
      return result.passed
    })
    if (!preflightPassed)
      return await reject(taskId, 'Rejected at pre-flight validation')

    // ── Stage 5: Oracle / NOP validation ─────────────────────────────────────
    // Two independent containers:
    //   NOP    — test.sh only        → reward.txt must be "0"
    //   Oracle — solve.sh + test.sh  → reward.txt must be "1"
    const oraclePassed = await step.run('stage-oracle-nop', async () => {
      const result = await callBackend('oracle-nop', taskId, storagePath)
      await logStage(taskId, 'oracle_nop', result.passed, result.message)
      return result.passed
    })
    if (!oraclePassed)
      return await reject(taskId, 'Rejected at oracle/NOP validation')

    // ── Stage 6: Easiness prefilter ───────────────────────────────────────────
    // CrewAI-powered agent probe: 5 staggered-parallel runs using the
    // easiness_model (fast/cheap model). Passes if 1–4/5 succeed.
    const easinessPassed = await step.run('stage-easiness', async () => {
      const result = await callBackend('easiness', taskId, storagePath)
      // const result = { passed: true, message: 'Easiness backend call succeeded' }
      await logStage(taskId, 'easiness', result.passed, result.message)
      return result.passed
    })
    if (!easinessPassed)
      return await reject(taskId, 'Rejected at easiness prefilter')

    // ── Stage 7: Difficulty probe ─────────────────────────────────────────────
    // CrewAI-powered agent probe: 5 staggered-parallel runs using the
    // frontier_model (strong model). Passes if 1–3/5 succeed.
    const difficultyPassed = await step.run('stage-difficulty', async () => {
      const result = await callBackend('difficulty', taskId, storagePath)
      // const result = { passed: true, message: 'Difficulty backend call succeeded' }
      await logStage(taskId, 'difficulty', result.passed, result.message)
      return result.passed
    })
    if (!difficultyPassed)
      return await reject(taskId, 'Rejected at difficulty probe')

    // ── Stage 8: Agent quality check ─────────────────────────────────────────
    // TEMPORARILY DISABLED — backend call replaced with dummy 5s wait for testing
    // LLM-as-judge across 6 criteria: instruction realism, natural register,
    // no leaked test assertions, no revealed oracle path, no over-specified
    // steps, and agent actionability. Threshold: 70%. Summary stored on
    // Task.agentQualityNote server-side.
    const agentQualityPassed = await step.run(
      'stage-agent-quality',
      async () => {
        await new Promise(resolve => setTimeout(resolve, 5000))
        const result = await callBackend('agent-quality', taskId, storagePath)
        // const result = { passed: true, message: 'Agent quality backend call succeeded' }
        const summaryLine = result.message.split('\n')[0]
        await logStage(taskId, 'agent_quality', result.passed, summaryLine)
        return result.passed
      },
    )
    if (!agentQualityPassed)
      return await reject(taskId, 'Rejected at agent quality check')

    // ── Stage 9: Sia Network upload ──────────────────────────────────────────
    // Upload the task to Sia decentralized storage. This is the final pipeline
    // stage — if it fails, the task is still pipeline_passed but siaStatus
    // reflects the failure so admins can retry.
    const siaPassed = await step.run('stage-sia-upload', async () => {
      const result = await callBackend('sia-upload', taskId, storagePath)
      await logStage(taskId, 'sia_upload', result.passed, result.message)
      return result.passed
    })
    if (!siaPassed) {
      // Sia upload failure is non-fatal — task is still pipeline_passed
      // but siaStatus will be "failed" on the DB so admins can retry.
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'pipeline_passed' },
      })
      return {
        taskId,
        result: 'pipeline_passed',
        warning: 'Sia upload failed, task is pipeline_passed',
      }
    }

    // ── All stages passed (including Sia) ─────────────────────────────────────
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'pipeline_passed' },
    })

    return { taskId, result: 'pipeline_passed' }
  },
)

// ── Benchmark runner ──────────────────────────────────────────────────────────

export const runBenchmark = inngest.createFunction(
  { id: 'benchmark-run', name: 'Run benchmark against model' },
  { event: 'benchmark/run.started' },

  async ({ event, step }) => {
    const { runId, taskId, storagePath, agentConfig } = event.data

    const result = await step.run('execute-run', async () => {
      const backendUrl = resolveBackendUrl()

      const res = await fetch(`${backendUrl}/api/pipeline/benchmark/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, taskId, storagePath, agentConfig }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(
          `Backend /benchmark/execute returned ${res.status}: ${text}`,
        )
      }

      const data: { passed: boolean; message: string } = await res.json()
      const score = data.passed ? 1 : 0

      await prisma.benchmarkRun.update({
        where: { id: runId },
        data: { status: data.passed ? 'completed' : 'failed', score },
      })

      return { score }
    })

    return { runId, taskId, ...result }
  },
)

// ═══════════════════════════════════════════════════════════════════════════════
// WATCHDOG 1: Pipeline Midwife
// ═══════════════════════════════════════════════════════════════════════════════
//
// Detects tasks stuck in "pipeline_running" status and re-queues or rejects them.
//
// Strategy:
//   1. Find all tasks with status "pipeline_running" and updatedAt older than
//      PIPELINE_STUCK_GRACE_MS (30 min).
//   2. For each stuck task, check if an Inngest run is still active by querying
//      the Inngest Dev Server API.
//   3. If no active run exists → the pipeline crashed. Re-queue by sending a
//      fresh pipeline/task.submitted event.
//   4. If the task has been stuck for longer than PIPELINE_DEADLINE_MS (2 hours)
//      → force-reject it regardless, to prevent infinite loops.
//
// This runs every 5 minutes via cron.

export const pipelineWatchdog = inngest.createFunction(
  {
    id: 'pipeline-watchdog',
    name: 'Pipeline Watchdog — midwife stuck processes',
  },
  { cron: '*/5 * * * *' }, // every 5 minutes

  async ({ step }) => {
    const now = new Date()
    const graceCutoff = new Date(now.getTime() - PIPELINE_STUCK_GRACE_MS)
    const deadlineCutoff = new Date(now.getTime() - PIPELINE_DEADLINE_MS)

    // ── Step 1: Find stuck tasks ──────────────────────────────────────────────
    const stuckTasks = await step.run('find-stuck-tasks', async () => {
      return prisma.task.findMany({
        where: {
          status: 'pipeline_running',
          updatedAt: { lte: graceCutoff },
        },
        take: WATCHDOG_BATCH_SIZE,
        orderBy: { updatedAt: 'asc' },
        select: {
          id: true,
          projectId: true,
          storagePath: true,
          updatedAt: true,
        },
      })
    })

    if (stuckTasks.length === 0) {
      return { checked: 0, requeued: 0, rejected: 0 }
    }

    console.log(
      `[pipeline-watchdog] Found ${stuckTasks.length} stuck task(s)`,
    )

    let requeued = 0
    let rejected = 0

    for (const task of stuckTasks) {
      const updatedAtTime = new Date(task.updatedAt).getTime()
      const isPastDeadline = updatedAtTime <= deadlineCutoff.getTime()

      if (isPastDeadline) {
        // ── Force-reject: stuck for > 2 hours ─────────────────────────────────
        await step.run(`reject-stuck-${task.id}`, async () => {
          await prisma.task.update({
            where: { id: task.id },
            data: { status: 'rejected' },
          })
          await prisma.pipelineLog.create({
            data: {
              taskId: task.id,
              stage: 'watchdog',
              passed: false,
              message:
                'Force-rejected by pipeline watchdog — task was stuck in pipeline_running for > 2 hours',
            },
          })
        })
        rejected++
        continue
      }

      // ── Check if Inngest has an active run for this task ────────────────────
      const hasActiveRun = await step.run(
        `check-active-run-${task.id}`,
        async () => {
          return checkInngestActiveRun(task.id)
        },
      )

      if (!hasActiveRun) {
        // ── Re-queue: pipeline crashed without completing ─────────────────────
        await step.run(`requeue-${task.id}`, async () => {
          // Reset status back to pending so the pipeline can pick it up
          await prisma.task.update({
            where: { id: task.id },
            data: { status: 'pending' },
          })
          await prisma.pipelineLog.create({
            data: {
              taskId: task.id,
              stage: 'watchdog',
              passed: true,
              message:
                'Re-queued by pipeline watchdog — previous run was orphaned',
            },
          })
        })

        // Fire a new pipeline event
        await step.run(`send-event-${task.id}`, async () => {
          const { inngest } = await import('./client')
          await inngest.send({
            name: 'pipeline/task.submitted',
            data: {
              taskId: task.id,
              projectId: task.projectId,
              storagePath: task.storagePath,
            },
          })
        })
        requeued++
      }
    }

    return {
      checked: stuckTasks.length,
      requeued,
      rejected,
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════════════
// WATCHDOG 2: Cleanup Watchdog
// ═══════════════════════════════════════════════════════════════════════════════
//
// Periodically removes local ZIP + extracted directories for rejected tasks,
// AND removes the Docker images built during the CI stage for those tasks.
//
// Only tasks that pass the pipeline (pipeline_passed / approved) keep their
// assets on Sia storage. Everything else is temporary build artifact:
//   - ZIP uploads on disk → deleted
//   - Extracted task directories → deleted
//   - Docker images tagged openbench-task-<id> → removed via backend API
//   - Dangling build cache → pruned
//
// This runs every hour via cron.

export const cleanupWatchdog = inngest.createFunction(
  {
    id: 'cleanup-watchdog',
    name: 'Cleanup Watchdog — purge rejected task files & Docker images',
  },
  { cron: '0 * * * *' }, // every hour at :00

  async ({ step }) => {
    const now = new Date()
    const ageCutoff = new Date(now.getTime() - CLEANUP_AGE_MS)

    // ── Step 1: Find old rejected tasks ───────────────────────────────────────
    const oldRejectedTasks = await step.run('find-old-rejected', async () => {
      return prisma.task.findMany({
        where: {
          status: 'rejected',
          updatedAt: { lte: ageCutoff },
        },
        take: WATCHDOG_BATCH_SIZE,
        orderBy: { updatedAt: 'asc' },
        select: {
          id: true,
          storagePath: true,
        },
      })
    })

    if (oldRejectedTasks.length === 0) {
      // Even if no old rejected tasks, still prune Docker system cache
      const pruned = await step.run('docker-system-prune', async () => {
        return callDockerPruneEndpoint()
      })
      return { checked: 0, deleted: 0, errors: 0, dockerPruned: pruned }
    }

    console.log(
      `[cleanup-watchdog] Found ${oldRejectedTasks.length} old rejected task(s) to clean up`,
    )

    let deleted = 0
    let errors = 0

    for (const task of oldRejectedTasks) {
      const ok = await step.run(`cleanup-task-${task.id}`, async () => {
        let taskOk = true

        try {
          // ── 1. Delete local ZIP file ──────────────────────────────────────────
          if (existsSync(task.storagePath)) {
            await unlink(task.storagePath)
            console.log(
              `[cleanup-watchdog] Deleted file: ${task.storagePath}`,
            )
          }

          // ── 2. Delete extracted directory ─────────────────────────────────────
          const extractedDir = task.storagePath.replace(/\.zip$/i, '')
          if (extractedDir !== task.storagePath && existsSync(extractedDir)) {
            await rm(extractedDir, { recursive: true, force: true })
            console.log(
              `[cleanup-watchdog] Deleted extracted dir: ${extractedDir}`,
            )
          }

          // ── 3. Remove Docker image for this task via backend API ──────────────
          const dockerOk = await callDockerCleanupEndpoint(task.id)

          // Log the combined cleanup result
          await prisma.pipelineLog.create({
            data: {
              taskId: task.id,
              stage: 'cleanup',
              passed: true,
              message: dockerOk
                ? `Local files + Docker image cleaned up for rejected task (age > 24h)`
                : `Local files cleaned up, but Docker image removal had issues`,
            },
          })
        } catch (err) {
          console.error(
            `[cleanup-watchdog] Error cleaning up task ${task.id}:`,
            err,
          )
          await prisma.pipelineLog.create({
            data: {
              taskId: task.id,
              stage: 'cleanup',
              passed: false,
              message: `Cleanup failed: ${err}`,
            },
          })
          taskOk = false
        }

        return taskOk
      })

      if (ok) {
        deleted++
      } else {
        errors++
      }
    }

    // ── Step 3: Prune Docker system cache ────────────────────────────────────
    const dockerPruned = await step.run('docker-system-prune', async () => {
      return callDockerPruneEndpoint()
    })

    return {
      checked: oldRejectedTasks.length,
      deleted,
      errors,
      dockerPruned,
    }
  },
)

// ── Helper: check if Inngest has an active run for a task ─────────────────────
//
// Queries the Inngest Dev Server API to see if there's a currently running
// or queued function run for the given task ID. This prevents the watchdog
// from re-queuing a task that is legitimately still being processed.
//
// Falls back to "assume active" (returns true) if the Inngest API is
// unreachable, to avoid duplicate re-queues during transient network issues.

async function checkInngestActiveRun(taskId: string): Promise<boolean> {
  try {
    const inngestUrl = resolveInngestUrl()
    if (!inngestUrl) {
      // No Inngest URL configured — can't check, assume active
      return true
    }

    // Query Inngest runs API for this function + event data
    const res = await fetch(
      `${inngestUrl}/v1/runs?functionId=pipeline-run&status=running&status=queued&limit=20`,
      { signal: AbortSignal.timeout(10_000) },
    )

    if (!res.ok) {
      console.warn(
        `[pipeline-watchdog] Inngest API returned ${res.status}, assuming active`,
      )
      return true
    }

    const body = await res.json()
    const runs: Array<{ id: string; eventData?: Record<string, unknown> }> =
      body?.data ?? body?.runs ?? []

    // Check if any active run references this taskId
    return runs.some((run) => {
      const data = run.eventData ?? {}
      return data.taskId === taskId
    })
  } catch (err) {
    // Network error — assume active to be safe
    console.warn(
      `[pipeline-watchdog] Failed to query Inngest API: ${err}, assuming active`,
    )
    return true
  }
}

// ── Helper: resolve Inngest URL for API queries ──────────────────────────────
function resolveInngestUrl(): string | undefined {
  const url = process.env.INNGEST_BASE_URL
  if (!url) return undefined
  if (process.env.RUNNING_IN_DOCKER === '1') return url
  return url.replace('http://inngest:', 'http://localhost:')
}

// ── Docker cleanup helpers ────────────────────────────────────────────────────
//
// These call the backend API to remove Docker images for specific tasks
// and prune the Docker system cache. They are used by the cleanup watchdog.

async function callDockerCleanupEndpoint(taskId: string): Promise<boolean> {
  try {
    const backendUrl = resolveBackendUrl()
    const res = await fetch(
      `${backendUrl}/api/pipeline/docker/cleanup/${taskId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30_000),
      },
    )
    if (!res.ok) {
      console.warn(
        `[cleanup-watchdog] Docker cleanup for ${taskId} returned ${res.status}`,
      )
      return false
    }
    const data = await res.json()
    return data.passed === true
  } catch (err) {
    console.warn(
      `[cleanup-watchdog] Docker cleanup for ${taskId} failed: ${err}`,
    )
    return false
  }
}

async function callDockerPruneEndpoint(): Promise<boolean> {
  try {
    const backendUrl = resolveBackendUrl()
    const res = await fetch(`${backendUrl}/api/pipeline/docker/prune`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      console.warn(
        `[cleanup-watchdog] Docker system prune returned ${res.status}`,
      )
      return false
    }
    const data = await res.json()
    console.log(`[cleanup-watchdog] Docker system prune: ${data.message}`)
    return data.passed === true
  } catch (err) {
    console.warn(
      `[cleanup-watchdog] Docker system prune failed: ${err}`,
    )
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Retry Difficulty Probe — standalone function
// ═══════════════════════════════════════════════════════════════════════════════
//
// Unlike the main pipeline, this function ONLY runs the difficulty probe stage.
// It is triggered by the difficulty/retry.started event when a user clicks the
// "Retry" button on a failed Difficulty Probe step.
//
// Previously-completed stages (similarity, ci, quality, etc.) are NOT re-run.
// If the difficulty probe passes, the task continues to agent_quality and
// sia_upload stages to complete the pipeline from where it left off.

export const retryDifficultyProbe = inngest.createFunction(
  { id: 'retry-difficulty-probe', name: 'Retry difficulty probe stage only' },
  { event: 'difficulty/retry.started' },

  async ({ event, step }) => {
    const { taskId, projectId, storagePath } = event.data

    // Mark task as running
    await step.run('mark-running', async () => {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'pipeline_running' },
      })
    })

    // ── Run ONLY the difficulty probe stage ──────────────────────────────────
    const difficultyPassed = await step.run('stage-difficulty', async () => {
      const result = await callBackend('difficulty', taskId, storagePath)
      await logStage(taskId, 'difficulty', result.passed, result.message)
      return result.passed
    })

    if (!difficultyPassed) {
      return await reject(taskId, 'Rejected at difficulty probe')
    }

    // ── Difficulty passed — run remaining stages: agent_quality, sia_upload ──
    const agentQualityPassed = await step.run(
      'stage-agent-quality',
      async () => {
        await new Promise(resolve => setTimeout(resolve, 5000))
        const result = await callBackend('agent-quality', taskId, storagePath)
        const summaryLine = result.message.split('\n')[0]
        await logStage(taskId, 'agent_quality', result.passed, summaryLine)
        return result.passed
      },
    )
    if (!agentQualityPassed) {
      return await reject(taskId, 'Rejected at agent quality check')
    }

    // ── Sia upload ───────────────────────────────────────────────────────────
    const siaPassed = await step.run('stage-sia-upload', async () => {
      const result = await callBackend('sia-upload', taskId, storagePath)
      await logStage(taskId, 'sia_upload', result.passed, result.message)
      return result.passed
    })
    if (!siaPassed) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'pipeline_passed' },
      })
      return {
        taskId,
        result: 'pipeline_passed',
        warning: 'Sia upload failed, task is pipeline_passed',
      }
    }

    // ── All remaining stages passed ──────────────────────────────────────────
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'pipeline_passed' },
    })

    return { taskId, result: 'pipeline_passed' }
  },
)

// ── Shared helper ─────────────────────────────────────────────────────────────

async function reject(taskId: string, reason: string) {
  await prisma.task.update({
    where: { id: taskId },
    data: { status: 'rejected' },
  })
  return { taskId, result: 'rejected', reason }
}
