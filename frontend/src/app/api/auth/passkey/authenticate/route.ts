// src/app/api/auth/passkey/authenticate/route.ts

import { NextResponse } from "next/server";
import { generatePasskeyAuthOptions, verifyPasskeyAuth } from "@/lib/auth/passkey";
import { signIn } from "@/lib/auth";

export async function GET() {
    try {
        const options = await generatePasskeyAuthOptions();
        return NextResponse.json(options);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate challenge";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const user = await verifyPasskeyAuth(body);

        if (!user) {
            return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
        }

        // Use NextAuth's signIn with the passkey credentials provider.
        // This creates a proper JWT session cookie that the middleware can decode.
        await signIn("passkey", {
            userId: user.id,
            redirect: false,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Authentication failed";
        return NextResponse.json({ error: message }, { status: 401 });
    }
}