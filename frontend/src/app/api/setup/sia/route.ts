// src/app/api/setup/sia/route.ts
// POST — stores Sia configuration and kicks off the SDK registration flow
//        via the backend Python service (no restart required).
// GET  — returns current Sia setup status

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The backend FastAPI service.
// In Docker, BACKEND_URL env is set to http://backend:8000.
// Fallback: derive from NEXT_PUBLIC_APP_URL (Codespaces) or localhost.
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
    let backendRes: Response;
    try {
      backendRes = await fetch(`${BACKEND_URL}/api/sia/register/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recovery_phrase }),
      });
    } catch {
      // Backend is not reachable at all — config is saved but registration cannot proceed
      return NextResponse.json(
        { error: "Backend service is unreachable. Ensure the pipeline service is running." },
        { status: 502 }
      );
    }

    if (!backendRes.ok) {
      let errorMsg = "Sia registration backend returned an error";
      try {
        const errData = await backendRes.json();
        if (errData?.error) errorMsg = errData.error;
      } catch {
        // ignore parse errors
      }
      return NextResponse.json(
        { error: errorMsg },
        { status: 502 }
      );
    }

    const data = await backendRes.json();

    if (!data.ok) {
      return NextResponse.json(
        { error: data.error ?? "Sia registration failed", siaRegistrationFailed: true },
        { status: 500 }
      );
    }

    // If the backend says "already_connected", reset the flow so the user
    // must re-authorize — the approval URL should always be presented to
    // the user during first-run setup.
    if (data.already_connected) {
      // Tell the frontend to still show the approval (actually the backend
      // should generate a fresh approval URL — but if stored key worked,
      // the user may need to re-approve. We'll return the stored key status
      // and let the frontend decide.)
      return NextResponse.json({
        ok: true,
        already_connected: true,
        backend_available: true,
        siaAppId,
        siaAppName,
      });
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

    // Return a proper error response instead of silently faking success
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}