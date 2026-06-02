export type ModelProvider  = "ollama" | "anthropic" | "deepseek";
export type TaskStatus     = "pending" | "pipeline_running" | "approved" | "rejected";
export type ScoringType    = "passfail" | "diff" | "regex";
export type EasinessResult = "too_easy" | "appropriate" | "too_hard";

export interface AgentConfig { provider: ModelProvider; modelId: string; }

export interface TaskDef {
  id: string;
  title: string;
  description: string;
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
