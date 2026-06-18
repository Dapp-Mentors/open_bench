// src/app/api/models/config/route.ts
//
// Model configuration — super_admin only for writes, admin+ for reads.
// Drop this in place of the existing route.ts.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { checkApiAuth, checkSuperAdmin } from "@/lib/auth/guards";

const DEFAULTS: Record<string, { modelId: string; modelName: string }> = {
  frontier_model: {
    modelId: "anthropic/claude-opus-4-20250514",
    modelName: "Claude Opus 4",
  },
  easiness_model: {
    modelId: "anthropic/claude-sonnet-4-20250514",
    modelName: "Claude Sonnet 4",
  },
  quality_model: {
    modelId: "anthropic/claude-sonnet-4-20250514",
    modelName: "Claude Sonnet 4",
  },
  agent_quality_model: {
    modelId: "anthropic/claude-sonnet-4-20250514",
    modelName: "Claude Sonnet 4",
  },
};

// Any admin can read the current model config
export async function GET() {
  const authResult = await checkApiAuth("admin");
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  try {
    const rows = await prisma.modelConfig.findMany();
    const configs = rows.map((row) => ({
      key: row.key,
      modelId: row.modelId,
      modelName: row.modelName,
    }));

    for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
      if (!configs.find((c) => c.key === key)) {
        configs.push({ key, ...defaultVal });
      }
    }

    return NextResponse.json(configs);
  } catch (error) {
    console.error("[MODEL-CONFIG] GET error:", error);
    const defaults = Object.entries(DEFAULTS).map(([key, val]) => ({ key, ...val }));
    return NextResponse.json(defaults);
  }
}

// Only super_admin can change model assignments
export async function POST(request: Request) {
  const authResult = await checkSuperAdmin();
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  try {
    const body = await request.json();
    const { key, modelId, modelName } = body;

    if (!key || !modelId) {
      return NextResponse.json(
        { error: "Missing required fields: key, modelId" },
        { status: 400 }
      );
    }

    const validKeys = new Set(Object.keys(DEFAULTS));
    if (!validKeys.has(key)) {
      return NextResponse.json(
        { error: `Invalid key '${key}'. Must be one of: ${[...validKeys].sort().join(", ")}` },
        { status: 400 }
      );
    }

    const row = await prisma.modelConfig.upsert({
      where: { key },
      update: { modelId, modelName: modelName || "", updatedAt: new Date() },
      create: { key, modelId, modelName: modelName || "", updatedAt: new Date() },
    });

    return NextResponse.json({
      key: row.key,
      modelId: row.modelId,
      modelName: row.modelName,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[MODEL-CONFIG] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 }
    );
  }
}