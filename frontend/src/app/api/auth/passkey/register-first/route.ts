// src/app/api/auth/passkey/register-first/route.ts
//
// GET  /api/auth/passkey/register-first  → generate registration options (no auth required)
// POST /api/auth/passkey/register-first  → verify + create user + passkey
//
// This endpoint allows a brand-new user to register their fingerprint directly
// from the login page without needing OAuth first.

import { NextResponse } from "next/server";
import {
  generateFirstTimePasskeyOptions,
  verifyFirstTimePasskeyRegistration,
} from "@/lib/auth/passkey";
import { cookies } from "next/headers";
import { createId } from "@paralleldrive/cuid2";

// GET: generate registration options for a first-time user
export async function GET() {
  try {
    const { options, tempId } = await generateFirstTimePasskeyOptions();
    // Send the tempId alongside the options so the client can send it back on verify
    return NextResponse.json({ ...options, _tempId: tempId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate options";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: verify the registration and create the user + passkey, then issue a session
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { response, tempId } = body;

    if (!tempId || !response) {
      return NextResponse.json(
        { error: "Missing tempId or response" },
        { status: 400 }
      );
    }

    const result = await verifyFirstTimePasskeyRegistration(tempId, response);

    if (!result.verified || !result.user) {
      return NextResponse.json(
        { error: "Registration verification failed" },
        { status: 400 }
      );
    }

    // Create a session manually (Auth.js database sessions)
    const sessionToken = createId();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const { prisma } = await import("@/lib/prisma/client");

    await prisma.session.create({
      data: {
        sessionToken,
        userId: result.user.id,
        expires,
      },
    });

    const response_next = NextResponse.json({ success: true, userId: result.user.id });

    // Set the session cookie (Auth.js v5 cookie name)
    response_next.cookies.set("authjs.session-token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires,
      path: "/",
    });

    return response_next;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}