// src/app/api/admin/users/route.ts
//
// User management endpoints — super_admin only.
//
// GET  /api/admin/users              → list all users (with task counts & memberships)
// GET  /api/admin/users?id=xyz       → get a single user
// PATCH /api/admin/users             → update a user's role

import { NextResponse } from "next/server";
import { checkSuperAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import type { Role } from "@prisma/client";

const ASSIGNABLE_ROLES: Role[] = ["user", "admin"];
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
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                createdAt: true,
                _count: { select: { tasks: true, passkeys: true, accounts: true } },
                memberships: {
                    select: {
                        id: true,
                        role: true,
                        createdAt: true,
                        project: { select: { id: true, name: true, domain: true } },
                    },
                },
            },
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
            _count: {
                select: {
                    passkeys: true,
                    accounts: true,
                    tasks: true,
                },
            },
            memberships: {
                select: {
                    id: true,
                    role: true,
                    projectId: true,
                    project: { select: { id: true, name: true, domain: true } },
                },
            },
        },
        orderBy: { createdAt: "asc" },
    });

    // Attach per-status task counts for each user
    const usersWithCounts = await Promise.all(
        users.map(async (user) => {
            const statusCounts = await prisma.task.groupBy({
                by: ["status"],
                where: { submittedById: user.id },
                _count: { status: true },
            });

            const taskCounts: Record<string, number> = {};
            for (const s of statusCounts) {
                taskCounts[s.status] = s._count.status;
            }

            return {
                ...user,
                taskCounts,
                totalTasks: user._count.tasks,
            };
        })
    );

    return NextResponse.json(usersWithCounts);
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

    // Prevent assigning super_admin — only user and admin are assignable
    if (!ASSIGNABLE_ROLES.includes(role as Role)) {
        return NextResponse.json(
            { error: `Cannot assign role "${role}". Only user and admin roles are assignable.` },
            { status: 403 }
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