// src/app/api/setup/sia/route.ts
// POST — stores Sia configuration and kicks off the SDK registration flow
//        via the backend Python service (no restart required).
// GET  — returns current Sia setup status

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The backend FastAPI service (must match the deployed URL)
const BACKEND_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(":3000", ":8000") ?? "http://localhost:8000";

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
        { error: "recovery_phrase is required — enter your BIP-39 recovery phrase" },
        { status: 400 }
      );
    }

    // Step 1: Save the config to the database so the backend can read it
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

    // Step 2: Call the backend's Sia SDK to start the registration flow
    // using the user's recovery phrase.
    const backendRes = await fetch(`${BACKEND_URL}/api/sia/register/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recovery_phrase }),
    });

    if (!backendRes.ok) {
      // Backend may not be running — config is saved, registration will
      // happen on next restart.
      console.warn("[SETUP-SIA] Backend registration unavailable — config saved for later");
      return NextResponse.json({
        ok: true,
        backend_available: false,
        siaAppId,
        siaAppName,
      });
    }

    const data = await backendRes.json();

    if (!data.ok) {
      return NextResponse.json(
        { error: data.error ?? "Sia registration failed", siaRegistrationFailed: true },
        { status: 500 }
      );
    }

    // Return the SDK-generated approval URL to the frontend
    return NextResponse.json({
      ok: true,
      approval_url: data.approval_url,
      backend_available: true,
      siaAppId,
      siaAppName,
    });

  } catch (error) {
    console.error("[SETUP-SIA] Error:", error);

    // If the backend isn't reachable, the config is still saved —
    // registration will happen when the backend restarts.
    return NextResponse.json({
      ok: true,
      backend_available: false,
      siaAppId: null,
      siaAppName: null,
    });
  }
}