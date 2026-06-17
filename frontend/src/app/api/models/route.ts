import { NextResponse } from "next/server";

const OPENROUTER_API = "https://openrouter.ai/api/v1/models";

// Price tiers based on prompt price per token
function classifyPrice(promptPrice: number): "free" | "low" | "medium" | "high" {
  if (promptPrice === 0) return "free";
  if (promptPrice < 1e-6) return "low";        // < $1/M tokens
  if (promptPrice < 5e-6) return "medium";     // < $5/M tokens
  return "high";
}

export async function GET() {
  try {
    const res = await fetch(OPENROUTER_API, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 3600 }, // cache for 1 hour
    });

    if (!res.ok) {
      return NextResponse.json(getCuratedModels());
    }

    const data = await res.json();
    const rawModels: any[] = data?.data ?? [];

    // Map OpenRouter's response into our OpenRouterModel shape
    const models = rawModels
      .filter((m: any) => m.id && m.name)
      .map((m: any) => {
        const promptPrice = parseFloat(m?.pricing?.prompt ?? "0") || 0;
        const context = m?.context_length ?? 0;
        return {
          modelId: m.id,
          modelName: m.name,
          context,
          pricing: classifyPrice(promptPrice),
          promptPrice,
        };
      })
      // Sort: free first, then by provider name, then by model name
      .sort((a: any, b: any) => {
        const priceOrder = { free: 0, low: 1, medium: 2, high: 3 };
        const pa = (priceOrder as any)[a.pricing] ?? 4;
        const pb = (priceOrder as any)[b.pricing] ?? 4;
        if (pa !== pb) return pa - pb;
        const provA = a.modelId.split("/")[0] ?? "";
        const provB = b.modelId.split("/")[0] ?? "";
        if (provA !== provB) return provA.localeCompare(provB);
        return a.modelName.localeCompare(b.modelName);
      });

    return NextResponse.json(models);
  } catch {
    return NextResponse.json(getCuratedModels());
  }
}

// Fallback curated list if OpenRouter is unreachable
function getCuratedModels() {
  return [
    { modelId: "anthropic/claude-opus-4-20250514", modelName: "Claude Opus 4", context: 200000, pricing: "high" },
    { modelId: "anthropic/claude-sonnet-4-20250514", modelName: "Claude Sonnet 4", context: 200000, pricing: "medium" },
    { modelId: "anthropic/claude-haiku-3.5", modelName: "Claude 3.5 Haiku", context: 200000, pricing: "low" },
    { modelId: "openai/gpt-4o", modelName: "GPT-4o", context: 128000, pricing: "medium" },
    { modelId: "openai/gpt-4o-mini", modelName: "GPT-4o Mini", context: 128000, pricing: "low" },
    { modelId: "openai/o3-mini", modelName: "o3-mini", context: 200000, pricing: "medium" },
    { modelId: "google/gemini-2.5-pro-preview-06-05", modelName: "Gemini 2.5 Pro", context: 1000000, pricing: "medium" },
    { modelId: "google/gemini-2.5-flash-preview-05-20", modelName: "Gemini 2.5 Flash", context: 1000000, pricing: "low" },
    { modelId: "deepseek/deepseek-chat-v3-0324", modelName: "DeepSeek V3 (0324)", context: 131072, pricing: "low" },
    { modelId: "deepseek/deepseek-r1", modelName: "DeepSeek R1", context: 131072, pricing: "low" },
    { modelId: "meta-llama/llama-4-maverick", modelName: "Llama 4 Maverick", context: 1000000, pricing: "low" },
    { modelId: "meta-llama/llama-4-scout", modelName: "Llama 4 Scout", context: 1000000, pricing: "low" },
    { modelId: "mistralai/mistral-large-2411", modelName: "Mistral Large 2", context: 128000, pricing: "medium" },
    { modelId: "qwen/qwen3-235b-a22b", modelName: "Qwen3 235B", context: 131072, pricing: "low" },
    { modelId: "x-ai/grok-3", modelName: "Grok 3", context: 131072, pricing: "medium" },
  ];
}