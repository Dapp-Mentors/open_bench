// src/app/api/admin/environment/route.ts
//
// API route to read and update environment settings (Sia, OpenRouter, providers)
// from the admin "Environment" page. Only super_admin users may modify these.
//
// This mirrors the setup wizard fields so that admins can adjust them post-setup.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.appSettings.findUnique({
      where: { id: "default" },
    });

    return NextResponse.json({
      // Sia
      siaIndexerUrl: settings?.siaIndexerUrl ?? "",
      siaAppId: settings?.siaAppId ?? "",
      siaAppName: settings?.siaAppName ?? "OpenBench",
      siaAppDescription: settings?.siaAppDescription ?? "",
      siaConnected: settings?.siaConnected ?? false,
      // OpenRouter — return the actual key (admin-only, super_admin access)
      openrouterKey: settings?.openrouterKey ?? "",
      hasOpenrouterKey: settings?.openrouterKey ? true : false,
      // Google
      googleClientId: settings?.googleClientId ?? "",
      googleClientSecret: settings?.googleClientSecret ?? "",
      // GitHub
      githubClientId: settings?.githubClientId ?? "",
      githubClientSecret: settings?.githubClientSecret ?? "",
      // WebAuthn
      webauthnRpId: settings?.webauthnRpId ?? "",
      webauthnOrigin: settings?.webauthnOrigin ?? "",
    });
  } catch (err) {
    console.error("[admin/environment] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    // Build update payload — only include fields that were provided
    const updateData: Record<string, string | boolean | null> = {};

    if (body.siaIndexerUrl !== undefined) updateData.siaIndexerUrl = body.siaIndexerUrl;
    if (body.siaAppId !== undefined) updateData.siaAppId = body.siaAppId;
    if (body.siaAppName !== undefined) updateData.siaAppName = body.siaAppName;
    if (body.siaAppDescription !== undefined) updateData.siaAppDescription = body.siaAppDescription;
    if (body.siaConnected !== undefined) updateData.siaConnected = body.siaConnected;

    if (body.openrouterKey !== undefined) {
      updateData.openrouterKey = body.openrouterKey || null;
    }

    if (body.googleClientId !== undefined) updateData.googleClientId = body.googleClientId;
    if (body.googleClientSecret !== undefined) updateData.googleClientSecret = body.googleClientSecret;
    if (body.githubClientId !== undefined) updateData.githubClientId = body.githubClientId;
    if (body.githubClientSecret !== undefined) updateData.githubClientSecret = body.githubClientSecret;
    if (body.webauthnRpId !== undefined) updateData.webauthnRpId = body.webauthnRpId;
    if (body.webauthnOrigin !== undefined) updateData.webauthnOrigin = body.webauthnOrigin;

    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: updateData,
      create: {
        id: "default",
        ...updateData,
      },
    });

    return NextResponse.json({
      success: true,
      ...updateData,
    });
  } catch (err) {
    console.error("[admin/environment] PUT error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}