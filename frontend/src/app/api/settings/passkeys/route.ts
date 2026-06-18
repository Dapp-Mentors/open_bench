// src/app/api/settings/passkeys/route.ts
// GET /api/settings/passkeys → list current user's passkeys

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const passkeys = await prisma.passkey.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      name: true,
      deviceType: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(passkeys);
}