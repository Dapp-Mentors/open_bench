// src/app/api/sia/status/route.ts — proxy to backend Sia status
import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/sia/status`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { connected: false, mode: "live", reason: `Backend returned ${res.status}` },
        { status: 200 }, // always 200 so the frontend doesn't break
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { connected: false, mode: "live", reason: "Backend unreachable" },
    );
  }
}