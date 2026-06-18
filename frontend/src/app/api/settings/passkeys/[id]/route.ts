// src/app/api/settings/passkeys/[id]/route.ts
// DELETE /api/settings/passkeys/[id] → remove a passkey (current user only)

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma/client";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Find the passkey and make sure it belongs to this user
  const passkey = await prisma.passkey.findUnique({ where: { id } });

  if (!passkey || passkey.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.passkey.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}