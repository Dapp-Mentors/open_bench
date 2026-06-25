// src/app/api/setup/sia/check/route.ts
// POST checks if the Sia app was approved on the indexer.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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