// src/app/api/setup/sia/check/route.ts
// POST — polls the backend to check if the user has approved the app
//        on the Sia indexer. If approved, marks siaConnected in the DB.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The backend FastAPI service.
// In Docker, BACKEND_URL env is set to http://backend:8000.
// Fallback: derive from NEXT_PUBLIC_APP_URL (Codespaces) or localhost.
const BACKEND_URL = process.env.BACKEND_URL
  ?? process.env.NEXT_PUBLIC_APP_URL?.replace(":3000", ":8000")
  ?? "http://localhost:8000";

export async function POST() {
  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/sia/register/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!backendRes.ok) {
      return NextResponse.json({ ok: false, error: "Backend unavailable" }, { status: 502 });
    }

    const data = await backendRes.json();

    if (data.ok && data.status === "approved") {
      // Mark as connected in the DB
      await prisma.appSettings.update({
        where: { id: "default" },
        data: { siaConnected: true },
      });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ ok: false, error: "Backend unavailable" }, { status: 502 });
  }
}