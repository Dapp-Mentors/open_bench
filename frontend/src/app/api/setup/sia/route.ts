// src/app/api/setup/sia/route.ts
// POST saves Sia config and starts SDK registration via the backend.
// GET returns current Sia setup status.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BACKEND_URL = process.env.BACKEND_URL
  ?? process.env.NEXT_PUBLIC_APP_URL?.replace(":3000", ":8000")
  ?? "http://localhost:8000";

export async function GET() {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: "default" },
    });

    return NextResponse.json({
      siaConnected: settings?.siaConnected ?? false,
      siaIndexerUrl: settings?.siaIndexerUrl ?? null,
      siaAppId: settings?.siaAppId ?? null,
      siaAppName: settings?.siaAppName ?? null,
      siaAppDescription: settings?.siaAppDescription ?? null,
    });
  } catch {
    return NextResponse.json({
      siaConnected: false,
      siaIndexerUrl: null,
      siaAppId: null,
      siaAppName: null,
      siaAppDescription: null,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { siaIndexerUrl, siaAppId, siaAppName, siaAppDescription, recovery_phrase } = body;

    if (!siaIndexerUrl || !siaAppId || !siaAppName) {
      return NextResponse.json(
        { error: "siaIndexerUrl, siaAppId, and siaAppName are required" },
        { status: 400 }
      );
    }

    if (!recovery_phrase) {
      return NextResponse.json(
        { error: "recovery_phrase is required" },
        { status: 400 }
      );
    }

    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: {
        siaIndexerUrl,
        siaAppId,
        siaAppName,
        siaAppDescription: siaAppDescription ?? "",
        siaConnected: false,
      },
      create: {
        id: "default",
        siaIndexerUrl,
        siaAppId,
        siaAppName,
        siaAppDescription: siaAppDescription ?? "",
        siaConnected: false,
      },
    });

    let backendRes: Response;
    try {
      backendRes = await fetch(`${BACKEND_URL}/api/sia/register/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recovery_phrase }),
      });
    } catch {
      return NextResponse.json(
        { error: "Backend service is unreachable." },
        { status: 502 }
      );
    }

    if (!backendRes.ok) {
      let errorMsg = "Sia registration backend returned an error";
      try {
        const errData = await backendRes.json();
        if (errData?.error) errorMsg = errData.error;
      } catch {
        // ignore
      }
      return NextResponse.json({ error: errorMsg }, { status: 502 });
    }

    const data = await backendRes.json();

    if (!data.ok) {
      return NextResponse.json(
        { error: data.error ?? "Sia registration failed", siaRegistrationFailed: true },
        { status: 500 }
      );
    }

    if (data.already_connected) {
      return NextResponse.json({
        ok: true,
        already_connected: true,
        backend_available: true,
        siaAppId,
        siaAppName,
      });
    }

    return NextResponse.json({
      ok: true,
      approval_url: data.approval_url,
      backend_available: true,
      siaAppId,
      siaAppName,
    });

  } catch (error) {
    console.error("[SETUP-SIA] Error:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}