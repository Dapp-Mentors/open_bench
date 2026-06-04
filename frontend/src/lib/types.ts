export type ModelProvider  = "ollama" | "anthropic" | "deepseek";
export type ScoringType    = "passfail" | "diff" | "regex";
export type EasinessResult = "too_easy" | "appropriate" | "too_hard";

// Task status lifecycle:
//   pending → pipeline_running → pipeline_passed → approved
//                             ↘ rejected
//
// "pipeline_passed" is the new intermediate state — all automated checks
// cleared, but a human reviewer hasn't signed off yet.
// Admins POST /api/projects/[id]/tasks/[taskId]/approve to flip to "approved".
// "approved" is the only state that allows benchmark runs.
export type TaskStatus =
  | "pending"
  | "pipeline_running"
  | "pipeline_passed"   // NEW — automated pipeline done, awaiting human review
  | "approved"          // human-reviewed and accepted — runs allowed
  | "rejected";

export interface AgentConfig { provider: ModelProvider; modelId: string; }

export interface TaskDef {
  id: string;
  projectId: string;          // NEW — every task belongs to a project
  title: string;
  description: string;
  domain: string;
  language: string;
  dockerImage: string;
  timeoutMs: number;
  scoringType: ScoringType;
  expectedOutput?: string;
  expectedPattern?: string;
}

export interface PipelineLog {
  id: string;
  taskId: string;
  stage: string;
  passed: boolean | null;
  message: string;
  ts: string;
}

export interface Task extends TaskDef {
  status: TaskStatus;
  similarityScore?: number | null;
  isDuplicate?: boolean | null;
  ciPassed?: boolean | null;
  qualityScore?: number | null;
  qualityDetails?: string | null;
  easinessResult?: EasinessResult | null;
  agentQualityNote?: string | null;
  siaHash?: string | null;
  indexdKey?: string | null;
  embeddingJson?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;   // set when an admin approves
  pipelineLogs?: PipelineLog[];
  runs?: BenchmarkRun[];
  _count?: { runs: number };
}

export interface RunLog {
  id: string;
  runId: string;
  stream: "stdout" | "stderr";
  line: string;
  ts: string;
}

export interface BenchmarkRun {
  id: string;
  taskId: string;
  projectId: string;            // denormalised for easier querying
  modelId: string;
  provider: string;
  status: string;
  score?: number | null;
  runtimeMs?: number | null;
  tokenUsage?: number | null;
  siaHash?: string | null;
  indexdKey?: string | null;
  createdAt: string;
  updatedAt: string;
  logs?: RunLog[];
}

export interface ModelOption {
  provider: ModelProvider;
  modelId: string;
  label: string;
  requiresKey: boolean;
}

// Project — top-level container
export interface Project {
  id: string;
  name: string;
  description: string;
  domain: string;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
}

// Leaner version used on the dashboard list
export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  domain: string;
  createdAt: string;
  _count: {
    tasks: number;
    approvedTasks: number;
    pendingTasks: number;
    rejectedTasks: number;
  };
}
