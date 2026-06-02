import { NextResponse } from "next/server";

// Stub MODEL_OPTIONS — replace with import from @openbench/agents once packages are built
const MODEL_OPTIONS = [
  { provider: "ollama",    modelId: "llama3",                   label: "Llama 3 (local)",    requiresKey: false },
  { provider: "ollama",    modelId: "mistral",                  label: "Mistral 7B (local)", requiresKey: false },
  { provider: "ollama",    modelId: "codellama",                label: "Code Llama (local)", requiresKey: false },
  { provider: "anthropic", modelId: "claude-sonnet-4-20250514", label: "Claude Sonnet 4",    requiresKey: true  },
  { provider: "anthropic", modelId: "claude-opus-4-20250514",   label: "Claude Opus 4",      requiresKey: true  },
  { provider: "deepseek",  modelId: "deepseek-chat",            label: "DeepSeek Chat",      requiresKey: true  },
  { provider: "deepseek",  modelId: "deepseek-coder",           label: "DeepSeek Coder",     requiresKey: true  },
];

export async function GET() {
  return NextResponse.json(MODEL_OPTIONS);
}
