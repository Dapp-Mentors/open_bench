import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

// ── Default model assignments (used when DB has no config yet) ────────────────

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

export async function GET() {
  try {
    const rows = await prisma.modelConfig.findMany();

    const configs = rows.map((row) => ({
      key: row.key,
      modelId: row.modelId,
      modelName: row.modelName,
    }));

    // Fill in defaults for any missing keys
    for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
      if (!configs.find((c) => c.key === key)) {
        configs.push({ key, ...defaultVal });
      }
    }

    return NextResponse.json(configs);
  } catch (error) {
    console.error("[MODEL-CONFIG] GET error:", error);
    // Return defaults if DB is unreachable
    const defaults = Object.entries(DEFAULTS).map(([key, val]) => ({
      key,
      ...val,
    }));
    return NextResponse.json(defaults);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { key, modelId, modelName } = body;

    if (!key || !modelId) {
      return NextResponse.json(
        { error: "Missing required fields: key, modelId" },
        { status: 400 }
      );
    }

    const validKeys = new Set([
      "frontier_model",
      "easiness_model",
      "quality_model",
      "agent_quality_model",
    ]);

    if (!validKeys.has(key)) {
      return NextResponse.json(
        { error: `Invalid key '${key}'. Must be one of: ${[...validKeys].sort().join(", ")}` },
        { status: 400 }
      );
    }

    // Upsert: update if exists, create if not
    const row = await prisma.modelConfig.upsert({
      where: { key },
      update: {
        modelId,
        modelName: modelName || "",
        updatedAt: new Date(),
      },
      create: {
        key,
        modelId,
        modelName: modelName || "",
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      key: row.key,
      modelId: row.modelId,
      modelName: row.modelName,
      updatedAt: row.updatedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("[MODEL-CONFIG] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 }
    );
  }
}