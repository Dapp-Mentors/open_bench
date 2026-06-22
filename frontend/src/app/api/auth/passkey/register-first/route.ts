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
import { signIn } from "@/lib/auth";

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

// POST: verify the registration and create the user + passkey, then issue a JWT session
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

        // Use NextAuth's signIn with the passkey credentials provider.
        // This creates a proper JWT session cookie that the middleware can decode.
        const signInResponse = await signIn("passkey", {
            userId: result.user.id,
            redirect: false,
        });

        // Forward the Set-Cookie header from the signIn response so the
        // browser receives the session JWT cookie.
        const jsonResponse = NextResponse.json({ success: true, userId: result.user.id });
        if (signInResponse && "headers" in signInResponse) {
            const setCookie = (signInResponse as Response).headers.get("set-cookie");
            if (setCookie) {
                jsonResponse.headers.set("set-cookie", setCookie);
            }
        }

        return jsonResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}