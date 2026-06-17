// src/app/api/auth/passkey/authenticate/route.ts

import { NextResponse } from "next/server";
import { generatePasskeyAuthOptions, verifyPasskeyAuth } from "@/lib/auth/passkey";
import { prisma } from "@/lib/prisma/client";
import { createId } from "@paralleldrive/cuid2";

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

        const sessionToken = createId();
        const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await prisma.session.create({
            data: { sessionToken, userId: user.id, expires },
        });

        const response = NextResponse.json({ success: true });

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