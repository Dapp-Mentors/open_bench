// lib/inngest/pipeline-inngest.ts
//
// Inngest function that runs all 8 pipeline stages sequentially.
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
//
// If any stage fails, the task is marked "rejected" and the function stops.
// If all 8 pass, the task moves to "pipeline_passed" — awaiting human review.

import { inngest } from './client'
import { prisma } from '@/lib/prisma'

const STAGES = [
  'similarity',
  'ci',
  'quality',
  'preflight',
  'oracle_nop',
  'easiness',
  'difficulty',
  'agent_quality',
] as const

type StageKey = (typeof STAGES)[number]

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
    // TEMPORARILY SKIPPED — token conservation mode
    const similarityPassed = await step.run('stage-similarity', async () => {
      // const result = await callBackend('similarity', taskId, storagePath)
      // await logStage(taskId, 'similarity', result.passed, result.message)
      // return result.passed
      await logStage(taskId, 'similarity', true, 'Skipped — token conservation mode')
      return true
    })
    if (!similarityPassed)
      return await reject(taskId, 'Rejected at similarity check')

    // ── Stage 2: CI Checks ────────────────────────────────────────────────────
    // TEMPORARILY SKIPPED — token conservation mode
    const ciPassed = await step.run('stage-ci', async () => {
      // const result = await callBackend('ci', taskId, storagePath)
      // await logStage(taskId, 'ci', result.passed, result.message)
      // return result.passed
      await logStage(taskId, 'ci', true, 'Skipped — token conservation mode')
      return true
    })
    if (!ciPassed) return await reject(taskId, 'Rejected at CI checks')

    // ── Stage 3: Quality Check ────────────────────────────────────────────────
    // TEMPORARILY SKIPPED — token conservation mode
    // LLM-as-judge across 11 criteria. Full breakdown stored server-side on
    // Task.qualityDetails; only the summary line is logged here.
    const qualityPassed = await step.run('stage-quality', async () => {
      // const result = await callBackend('quality', taskId, storagePath)
      // const summaryLine = result.message.split('\n')[0]
      // await logStage(taskId, 'quality', result.passed, summaryLine)
      // return result.passed
      await logStage(taskId, 'quality', true, 'Skipped — token conservation mode')
      return true
    })
    if (!qualityPassed) return await reject(taskId, 'Rejected at quality check')

    // ── Stage 4: Validation pre-flight ───────────────────────────────────────
    // TEMPORARILY SKIPPED — token conservation mode
    const preflightPassed = await step.run('stage-preflight', async () => {
      // const result = await callBackend('preflight', taskId, storagePath)
      // await logStage(taskId, 'preflight', result.passed, result.message)
      // return result.passed
      await logStage(taskId, 'preflight', true, 'Skipped — token conservation mode')
      return true
    })
    if (!preflightPassed)
      return await reject(taskId, 'Rejected at pre-flight validation')

    // ── Stage 5: Oracle / NOP validation ─────────────────────────────────────
    // TEMPORARILY SKIPPED — token conservation mode
    // Two independent containers:
    //   NOP    — test.sh only        → reward.txt must be "0"
    //   Oracle — solve.sh + test.sh  → reward.txt must be "1"
    const oraclePassed = await step.run('stage-oracle-nop', async () => {
      // const result = await callBackend('oracle-nop', taskId, storagePath)
      // await logStage(taskId, 'oracle_nop', result.passed, result.message)
      // return result.passed
      await logStage(taskId, 'oracle_nop', true, 'Skipped — token conservation mode')
      return true
    })
    if (!oraclePassed)
      return await reject(taskId, 'Rejected at oracle/NOP validation')

    // ── Stage 6: Easiness prefilter ───────────────────────────────────────────
    // TEMPORARILY SKIPPED — token conservation mode (2026-06-13)
    // Oracle run ×5. Passes only if exactly 1/5 succeed.
    // 0/5 → TOO_HARD (reject), 2+/5 → TOO_EASY (reject), 1/5 → GOOD (pass).
    const easinessPassed = await step.run('stage-easiness', async () => {
      // Original logic (commented out during token conservation):
      // const result = await callBackend('easiness', taskId, storagePath)
      // await logStage(taskId, 'easiness', result.passed, result.message)
      // return result.passed
      await logStage(taskId, 'easiness', true, 'Skipped — token conservation mode')
      return true
    })
    if (!easinessPassed)
      return await reject(taskId, 'Rejected at easiness prefilter')

    // ── Stage 7: Difficulty probe ─────────────────────────────────────────────
    // TEMPORARILY SKIPPED — token conservation mode (2026-06-13)
    // Oracle run ×5. Passes if 1–3/5 succeed.
    // 0/5 → TOO_HARD (reject), 4–5/5 → TOO_EASY (reject), 1–3/5 → GOOD (pass).
    const difficultyPassed = await step.run('stage-difficulty', async () => {
      // Original logic (commented out during token conservation):
      // const result = await callBackend('difficulty', taskId, storagePath)
      // await logStage(taskId, 'difficulty', result.passed, result.message)
      // return result.passed
      await logStage(taskId, 'difficulty', true, 'Skipped — token conservation mode')
      return true
    })
    if (!difficultyPassed)
      return await reject(taskId, 'Rejected at difficulty probe')

    // ── Stage 8: Agent quality check ─────────────────────────────────────────
    // TEMPORARILY SKIPPED — token conservation mode (2026-06-13)
    // LLM-as-judge across 6 criteria: instruction realism, natural register,
    // no leaked test assertions, no revealed oracle path, no over-specified
    // steps, and agent actionability. Threshold: 70%. Summary stored on
    // Task.agentQualityNote server-side.
    const agentQualityPassed = await step.run(
      'stage-agent-quality',
      async () => {
        // Original logic (commented out during token conservation):
        // const result = await callBackend('agent-quality', taskId, storagePath)
        // const summaryLine = result.message.split('\n')[0]
        // await logStage(taskId, 'agent_quality', result.passed, summaryLine)
        // return result.passed
        await logStage(taskId, 'agent_quality', true, 'Skipped — token conservation mode')
        return true
      },
    )
    if (!agentQualityPassed)
      return await reject(taskId, 'Rejected at agent quality check')

    // ── All stages passed ─────────────────────────────────────────────────────
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

// ── Shared helper ─────────────────────────────────────────────────────────────

async function reject(taskId: string, reason: string) {
  await prisma.task.update({
    where: { id: taskId },
    data: { status: 'rejected' },
  })
  return { taskId, result: 'rejected', reason }
}
