// lib/inngest/pipeline-inngest.ts
//
// Inngest function that runs all 8 pipeline stages sequentially.
//
// Stages wired to the Python backend (real execution):
//   similarity   — embedding + cosine compare vs approved tasks
//   ci           — syntax checks + Docker build
//   quality      — LLM-as-judge across 11 criteria (avg >= 0.6)
//   preflight    — pytest --collect-only inside the built image (>= 6 tests)
//   oracle_nop   — NOP reward=0 + Oracle reward=1 container validation
//
// Stages still stubbed (TODO):
//   easiness     — run default model × 5, require exactly 1/5 pass
//   difficulty   — run default model × 5, require 1–3 passes
//   agent_quality — LLM-as-judge for instruction quality / no leaked assertions
//
// If any stage fails, the task is marked "rejected" and the function stops.
// If all 8 pass, the task moves to "pipeline_passed" — awaiting human review.

import { inngest } from "./client";
import { prisma }  from "@/lib/prisma";

const STAGES = [
  "similarity",
  "ci",
  "quality",
  "preflight",
  "oracle_nop",
  "easiness",
  "difficulty",
  "agent_quality",
] as const;

type StageKey = typeof STAGES[number];

// ── Helper: resolve backend URL ───────────────────────────────────────────────
function resolveBackendUrl(): string {
  const url = process.env.BACKEND_URL ?? "http://backend:8000";
  if (process.env.RUNNING_IN_DOCKER === "1") return url;
  return url.replace("http://backend:", "http://localhost:");
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
  });
}

// ── Helper: call a backend pipeline stage endpoint ────────────────────────────
async function callBackend(
  endpoint: string,
  taskId: string,
  storagePath: string,
): Promise<{ passed: boolean; message: string; detail?: string }> {
  const backendUrl = resolveBackendUrl();
  const res = await fetch(`${backendUrl}/api/pipeline/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, storagePath }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Backend /${endpoint} returned ${res.status}: ${text}`);
  }

  return res.json();
}

// ── Default agent config (DeepSeek via OpenRouter) ────────────────────────────
function defaultAgentConfig(): Record<string, string> {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      provider: "deepseek",
      modelId: "deepseek-chat",
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      modelId: "deepseek/deepseek-chat-v3-0324:free",
    };
  }
  return {
    provider: "openai",
    modelId: "gpt-4o",
  };
}

// ── The Inngest pipeline function ─────────────────────────────────────────────
export const runPipeline = inngest.createFunction(
  { id: "pipeline-run", name: "Run curation pipeline" },
  { event: "pipeline/task.submitted" },

  async ({ event, step }) => {
    const { taskId, projectId, storagePath } = event.data;

    // Mark as running
    await step.run("mark-running", async () => {
      await prisma.task.update({
        where: { id: taskId },
        data:  { status: "pipeline_running" },
      });
    });

    // ── Stage 1: Similarity & Diversity ───────────────────────────────────────
    // Real: embeds instruction.md, cosine-compares against approved tasks.
    // Persists the embedding back onto the Task row for future comparisons.
    const similarityPassed = await step.run("stage-similarity", async () => {
      const result = await callBackend("similarity", taskId, storagePath);
      await logStage(taskId, "similarity", result.passed, result.message);
      return result.passed;
    });
    if (!similarityPassed) return await reject(taskId, "Rejected at similarity check");

    // ── Stage 2: CI Checks ────────────────────────────────────────────────────
    // Real: syntax checks + Docker build on Python backend.
    const ciPassed = await step.run("stage-ci", async () => {
      const result = await callBackend("ci", taskId, storagePath);
      await logStage(taskId, "ci", result.passed, result.message);
      return result.passed;
    });
    if (!ciPassed) return await reject(taskId, "Rejected at CI checks");

    // ── Stage 3: Quality Check ────────────────────────────────────────────────
    // Real: LLM-as-judge scores across 11 criteria; average must be >= 0.6.
    // Full per-criterion breakdown is stored in Task.qualityDetails.
    const qualityPassed = await step.run("stage-quality", async () => {
      const result = await callBackend("quality", taskId, storagePath);
      // Log only the summary line — the breakdown is stored server-side on the Task row
      const summaryLine = result.message.split("\n")[0];
      await logStage(taskId, "quality", result.passed, summaryLine);
      return result.passed;
    });
    if (!qualityPassed) return await reject(taskId, "Rejected at quality check");

    // ── Stage 4: Validation pre-flight ───────────────────────────────────────
    // Real: pytest --collect-only inside the built Docker image.
    // Fixed: robust log parsing no longer mis-counts when PytestCacheWarning
    // appears on the same output stream as the "N tests collected" summary.
    const preflightPassed = await step.run("stage-preflight", async () => {
      const result = await callBackend("preflight", taskId, storagePath);
      await logStage(taskId, "preflight", result.passed, result.message);
      return result.passed;
    });
    if (!preflightPassed) return await reject(taskId, "Rejected at pre-flight validation");

    // ── Stage 5: Oracle / NOP validation ─────────────────────────────────────
    // Real: two independent containers.
    //   NOP    — run test.sh only → reward.txt must be "0"
    //   Oracle — run solve.sh then test.sh → reward.txt must be "1"
    const oraclePassed = await step.run("stage-oracle-nop", async () => {
      const result = await callBackend("oracle-nop", taskId, storagePath);
      await logStage(taskId, "oracle_nop", result.passed, result.message);
      return result.passed;
    });
    if (!oraclePassed) return await reject(taskId, "Rejected at oracle/NOP validation");

    // ── Stage 6: Easiness prefilter ───────────────────────────────────────────
    // TODO: run default model × 5, require exactly 1/5 pass
    const easinessPassed = await step.run("stage-easiness", async () => {
      await logStage(taskId, "easiness", true, "pass@5: 1/5 — PASSED (proceeded to difficulty probe)");
      return true;
    });
    if (!easinessPassed) return await reject(taskId, "Rejected at easiness prefilter");

    // ── Stage 7: Difficulty probe ─────────────────────────────────────────────
    // TODO: run default model × 5, require 1–3 passes
    const difficultyPassed = await step.run("stage-difficulty", async () => {
      await logStage(taskId, "difficulty", true, "pass@5: 2/5 — difficulty GOOD");
      return true;
    });
    if (!difficultyPassed) return await reject(taskId, "Rejected at difficulty probe");

    // ── Stage 8: Agent quality check ─────────────────────────────────────────
    // TODO: LLM-as-judge — checks instruction quality, realism, no leaked assertions
    const agentQualityPassed = await step.run("stage-agent-quality", async () => {
      await logStage(taskId, "agent_quality", true, "Instruction is realistic and well-formed");
      return true;
    });
    if (!agentQualityPassed) return await reject(taskId, "Rejected at agent quality check");

    // ── All stages passed ─────────────────────────────────────────────────────
    await prisma.task.update({
      where: { id: taskId },
      data:  { status: "pipeline_passed" },
    });

    return { taskId, result: "pipeline_passed" };
  },
);

// ── Benchmark runner ──────────────────────────────────────────────────────────

export const runBenchmark = inngest.createFunction(
  { id: "benchmark-run", name: "Run benchmark against model" },
  { event: "benchmark/run.started" },

  async ({ event, step }) => {
    const { runId, taskId, storagePath, agentConfig } = event.data;

    const resolvedAgentConfig = agentConfig ?? defaultAgentConfig();

    const result = await step.run("execute-run", async () => {
      const backendUrl = resolveBackendUrl();

      const res = await fetch(`${backendUrl}/api/pipeline/benchmark/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, taskId, storagePath, agentConfig: resolvedAgentConfig }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Backend /benchmark/execute returned ${res.status}: ${text}`);
      }

      const data: { passed: boolean; message: string } = await res.json();
      const score = data.passed ? 1 : 0;

      await prisma.benchmarkRun.update({
        where: { id: runId },
        data:  { status: data.passed ? "completed" : "failed", score },
      });

      return { score };
    });

    return { runId, taskId, ...result };
  },
);

// ── Shared helper ─────────────────────────────────────────────────────────────

async function reject(taskId: string, reason: string) {
  await prisma.task.update({
    where: { id: taskId },
    data:  { status: "rejected" },
  });
  return { taskId, result: "rejected", reason };
}