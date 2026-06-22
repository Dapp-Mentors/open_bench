// src/app/api/setup/status/route.ts
// Returns the current setup wizard status for the application.
// GET  — returns { setupComplete, siaConnected, hasOpenrouterKey, userCount }
// POST — marks setup as complete (no auth required — runs before any user exists)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: "default" },
    });

    const userCount = await prisma.user.count();

    return NextResponse.json({
      setupComplete: settings?.setupComplete ?? false,
      siaConnected: settings?.siaConnected ?? false,
      siaIndexerUrl: settings?.siaIndexerUrl ?? null,
      siaAppId: settings?.siaAppId ?? null,
      siaAppName: settings?.siaAppName ?? null,
      siaAppDescription: settings?.siaAppDescription ?? null,
      hasOpenrouterKey: settings?.openrouterKey ? true : false,
      userCount,
    });
  } catch {
    // Table may not exist yet (fresh DB)
    return NextResponse.json({
      setupComplete: false,
      siaConnected: false,
      siaAppId: null,
      hasOpenrouterKey: false,
      userCount: 0,
    });
  }
}

export async function POST() {
  try {
    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: { setupComplete: true },
      create: {
        id: "default",
        setupComplete: true,
        siaConnected: false,
        openrouterKey: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SETUP] Failed to mark complete:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}