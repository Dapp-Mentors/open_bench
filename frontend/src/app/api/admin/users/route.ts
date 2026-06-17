// src/app/api/admin/users/route.ts
//
// User management endpoints — super_admin only.
//
// GET  /api/admin/users              → list all users
// GET  /api/admin/users?id=xyz       → get a single user
// PATCH /api/admin/users             → update a user's role

import { NextResponse } from "next/server";
import { checkSuperAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import type { Role } from "@prisma/client";

const VALID_ROLES: Role[] = ["user", "admin", "super_admin"];

export async function GET(request: Request) {
    const authResult = await checkSuperAdmin();
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.message }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: { id: true, name: true, email: true, image: true, role: true, createdAt: true },
        });
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
        return NextResponse.json(user);
    }

    const users = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            createdAt: true,
            _count: { select: { passkeys: true, accounts: true } },
        },
        orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(users);
}

export async function PATCH(request: Request) {
    const authResult = await checkSuperAdmin();
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.message }, { status: authResult.status });
    }

    const body = await request.json();
    const { id, role } = body;

    if (!id || !role) {
        return NextResponse.json({ error: "id and role are required" }, { status: 400 });
    }

    if (!VALID_ROLES.includes(role)) {
        return NextResponse.json(
            { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
            { status: 400 }
        );
    }

    // Prevent super_admin from removing their own super_admin role
    if (id === authResult.userId && role !== "super_admin") {
        return NextResponse.json(
            { error: "You can't demote yourself" },
            { status: 403 }
        );
    }

    const updated = await prisma.user.update({
        where: { id },
        data: { role: role as Role },
        select: { id: true, email: true, role: true },
    });

    return NextResponse.json(updated);
}