// src/app/api/auth/passkey/authenticate/route.ts
//
// GET  /api/auth/passkey/authenticate  → generate authentication challenge
// POST /api/auth/passkey/authenticate  → verify response and create session

import { NextResponse } from "next/server";
import { generatePasskeyAuthOptions, verifyPasskeyAuth } from "@/lib/auth/passkey";
import { prisma } from "@/lib/prisma/client";
import { createId } from "@paralleldrive/cuid2";

// GET: generate a challenge for the browser to sign
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email") ?? undefined;

  try {
    const options = await generatePasskeyAuthOptions(email);
    return NextResponse.json(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate challenge";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: verify the signed challenge and issue a database session
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await verifyPasskeyAuth(body);

    if (!user) {
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    // Create a session manually (Auth.js database sessions)
    const sessionToken = createId();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    const response = NextResponse.json({ success: true, userId: user.id });

    // Set the session cookie (Auth.js v5 cookie name)
    response.cookies.set("authjs.session-token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires,
      path: "/",
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}