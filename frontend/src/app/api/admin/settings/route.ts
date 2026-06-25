// src/app/api/admin/settings/route.ts
//
// API route to read and update site-wide AppSettings (managed from the admin
// "Misc Settings" page). Currently supports:
//   - difficultyMaxRetries: max retry attempts for the difficulty probe stage
//
// Only super_admin users may modify these settings.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Gracefully handle missing column during migration rollout
    let difficultyMaxRetries = 3;
    try {
      const settings = await prisma.appSettings.findUnique({
        where: { id: "default" },
        select: { difficultyMaxRetries: true },
      });
      if (settings?.difficultyMaxRetries !== undefined) {
        difficultyMaxRetries = settings.difficultyMaxRetries;
      }
    } catch {
      // Column may not exist yet if migrations haven't run
      difficultyMaxRetries = 3;
    }

    return NextResponse.json({ difficultyMaxRetries });
  } catch (err) {
    console.error("[admin/settings] GET error:", err);
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
    const { difficultyMaxRetries } = body;

    if (
      difficultyMaxRetries === undefined ||
      typeof difficultyMaxRetries !== "number" ||
      difficultyMaxRetries < 0 ||
      difficultyMaxRetries > 10
    ) {
      return NextResponse.json(
        { error: "difficultyMaxRetries must be a number between 0 and 10" },
        { status: 400 },
      );
    }

    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: { difficultyMaxRetries },
      create: { id: "default", difficultyMaxRetries },
    });

    return NextResponse.json({
      success: true,
      difficultyMaxRetries,
    });
  } catch (err) {
    console.error("[admin/settings] PUT error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}