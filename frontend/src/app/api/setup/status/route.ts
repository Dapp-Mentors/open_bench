// src/app/api/setup/status/route.ts
// GET returns setup status. POST marks setup complete.
// Both plant the setup_complete cookie for the middleware.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function withSetupCookie(res: NextResponse): NextResponse {
  res.cookies.set("setup_complete", "true", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export async function GET() {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: "default" },
    });

    const userCount = await prisma.user.count();

    const payload = {
      setupComplete: settings?.setupComplete ?? false,
      siaConnected: settings?.siaConnected ?? false,
      siaIndexerUrl: settings?.siaIndexerUrl ?? null,
      siaAppId: settings?.siaAppId ?? null,
      siaAppName: settings?.siaAppName ?? null,
      siaAppDescription: settings?.siaAppDescription ?? null,
      hasOpenrouterKey: settings?.openrouterKey ? true : false,
      userCount,
    };

    const res = NextResponse.json(payload);

    if (payload.setupComplete) {
      withSetupCookie(res);
    }

    return res;
  } catch {
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

    return withSetupCookie(NextResponse.json({ ok: true }));
  } catch (error) {
    console.error("[SETUP] Failed to mark complete:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}