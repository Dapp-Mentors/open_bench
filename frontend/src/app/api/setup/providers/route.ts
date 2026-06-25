// src/app/api/setup/providers/route.ts
// POST stores OAuth and WebAuthn config. GET returns whether providers are configured.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: "default" },
    });

    return NextResponse.json({
      hasGoogle:
        !!(settings?.googleClientId && settings?.googleClientSecret),
      hasGitHub:
        !!(settings?.githubClientId && settings?.githubClientSecret),
      hasWebauthn:
        !!(settings?.webauthnRpId && settings?.webauthnOrigin),
      webauthnRpId: settings?.webauthnRpId ?? null,
      webauthnOrigin: settings?.webauthnOrigin ?? null,
    });
  } catch {
    return NextResponse.json({
      hasGoogle: false,
      hasGitHub: false,
      hasWebauthn: false,
      webauthnRpId: null,
      webauthnOrigin: null,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      googleClientId,
      googleClientSecret,
      githubClientId,
      githubClientSecret,
      webauthnRpId,
      webauthnOrigin,
    } = body;

    if (!googleClientId && !googleClientSecret && !githubClientId && !githubClientSecret) {
      return NextResponse.json(
        { error: "At least one provider (Google or GitHub) must be configured" },
        { status: 400 }
      );
    }

    if ((googleClientId && !googleClientSecret) || (!googleClientId && googleClientSecret)) {
      return NextResponse.json(
        { error: "Both Google client ID and secret are required" },
        { status: 400 }
      );
    }
    if ((githubClientId && !githubClientSecret) || (!githubClientId && githubClientSecret)) {
      return NextResponse.json(
        { error: "Both GitHub client ID and secret are required" },
        { status: 400 }
      );
    }

    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: {
        googleClientId: googleClientId?.trim() || null,
        googleClientSecret: googleClientSecret?.trim() || null,
        githubClientId: githubClientId?.trim() || null,
        githubClientSecret: githubClientSecret?.trim() || null,
        webauthnRpId: webauthnRpId?.trim() || null,
        webauthnOrigin: webauthnOrigin?.trim() || null,
      },
      create: {
        id: "default",
        googleClientId: googleClientId?.trim() || null,
        googleClientSecret: googleClientSecret?.trim() || null,
        githubClientId: githubClientId?.trim() || null,
        githubClientSecret: githubClientSecret?.trim() || null,
        webauthnRpId: webauthnRpId?.trim() || null,
        webauthnOrigin: webauthnOrigin?.trim() || null,
        siaConnected: false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SETUP-PROVIDERS] Error:", error);
    return NextResponse.json({ error: "Failed to save provider config" }, { status: 500 });
  }
}