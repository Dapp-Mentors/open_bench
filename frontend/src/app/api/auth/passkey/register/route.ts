// src/app/api/auth/passkey/register/route.ts
//
// POST /api/auth/passkey/register/options  → generate registration options
// POST /api/auth/passkey/register/verify   → verify and save credential

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
} from "@/lib/auth/passkey";

// GET options for registering a new passkey (must be logged in)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const options = await generatePasskeyRegistrationOptions(session.user.id);
    return NextResponse.json(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate options";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Verify and save the new passkey credential
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { response, name } = body;

    const result = await verifyPasskeyRegistration(session.user.id, response, name);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}