// src/app/api/setup/openrouter/route.ts
// POST stores the OpenRouter API key. GET returns whether a key is configured.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: "default" },
    });

    return NextResponse.json({
      hasKey: settings?.openrouterKey ? true : false,
      keyPrefix: settings?.openrouterKey
        ? settings.openrouterKey.substring(0, 8) + "..."
        : null,
    });
  } catch {
    return NextResponse.json({ hasKey: false, keyPrefix: null });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
      return NextResponse.json(
        { error: "A valid API key is required (at least 10 characters)" },
        { status: 400 }
      );
    }

    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: { openrouterKey: apiKey.trim() },
      create: {
        id: "default",
        openrouterKey: apiKey.trim(),
        siaConnected: false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SETUP-OPENROUTER] Error:", error);
    return NextResponse.json({ error: "Failed to save API key" }, { status: 500 });
  }
}