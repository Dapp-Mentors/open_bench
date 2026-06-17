// src/lib/types.ts
//
// Shared types used across the frontend.

import type { Role } from "@prisma/client";

// ─── Auth type augmentation ───────────────────────────────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
    };
  }

  interface User {
    role: Role;
  }
}

// ─── Pipeline types ───────────────────────────────────────────────────────────

export interface PipelineLog {
  id: string;
  taskId: string;
  stage: string;
  passed: boolean | null;
  message: string;
  ts: string;
}

export interface SiaLog {
  id: string;
  taskId: string;
  step: string;
  passed: boolean | null;
  message: string;
  ts: string;
}

export interface RunLog {
  id: string;
  runId: string;
  stream: string;
  line: string;
  ts: string;
}

export interface BenchmarkRun {
  id: string;
  taskId: string;
  projectId: string;
  provider: string;
  modelId: string;
  status: string;
  score: number | null;
  runtimeMs: number | null;
  tokenUsage: number | null;
  siaHash: string | null;
  indexdKey: string | null;
  createdAt: string;
  updatedAt: string;
  logs?: RunLog[];
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  domain: string;
  language: string;
  storagePath: string;
  dockerImage: string;
  timeoutMs: number;
  scoringType: string;
  expectedOutput: string | null;
  expectedPattern: string | null;
  status: string;
  similarityScore: number | null;
  isDuplicate: boolean | null;
  ciPassed: boolean | null;
  qualityScore: number | null;
  qualityDetails: string | null;
  easinessResult: string | null;
  agentQualityNote: string | null;
  siaHash: string | null;
  indexdKey: string | null;
  embeddingJson: string | null;
  siaStatus: string;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  pipelineLogs: PipelineLog[];
  siaLogs: SiaLog[];
  runs: BenchmarkRun[];
}

export type ModelConfigKey =
  | "frontier_model"
  | "easiness_model"
  | "quality_model"
  | "agent_quality_model";

export interface ModelConfig {
  id?: string;
  key: ModelConfigKey;
  modelId: string;
  modelName: string;
}

export interface OpenRouterModel {
  modelId: string;
  modelName: string;
  context: number;
  pricing: string;
}

export type SiaStatus = "pending" | "running" | "completed" | "failed" | "queued" | "ready";

export { type Role };