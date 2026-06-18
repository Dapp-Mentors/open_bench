// src/app/api/admin/projects/members/route.ts
//
// Manage project memberships — super_admin only.
//
// POST   /api/admin/projects/members   → add user to project
// DELETE /api/admin/projects/members   → remove user from project

import { NextResponse } from "next/server";
import { checkSuperAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";

export async function POST(request: Request) {
    const authResult = await checkSuperAdmin();
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.message }, { status: authResult.status });
    }

    const body = await request.json();
    const { userId, projectId, role } = body;

    if (!userId || !projectId) {
        return NextResponse.json({ error: "userId and projectId are required" }, { status: 400 });
    }

    // Verify user and project exist
    const [user, project] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.project.findUnique({ where: { id: projectId } }),
    ]);

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    // Check if membership already exists
    const existing = await prisma.projectMember.findUnique({
        where: { userId_projectId: { userId, projectId } },
    });

    if (existing) {
        return NextResponse.json({ error: "User is already a member of this project" }, { status: 409 });
    }

    const membership = await prisma.projectMember.create({
        data: {
            userId,
            projectId,
            role: role ?? "member",
        },
        select: {
            id: true,
            role: true,
            createdAt: true,
            project: { select: { id: true, name: true, domain: true } },
            user: { select: { id: true, name: true, email: true } },
        },
    });

    return NextResponse.json(membership, { status: 201 });
}

export async function DELETE(request: Request) {
    const authResult = await checkSuperAdmin();
    if (!authResult.ok) {
        return NextResponse.json({ error: authResult.message }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const projectId = searchParams.get("projectId");

    if (!userId || !projectId) {
        return NextResponse.json({ error: "userId and projectId are required" }, { status: 400 });
    }

    const existing = await prisma.projectMember.findUnique({
        where: { userId_projectId: { userId, projectId } },
    });

    if (!existing) {
        return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    await prisma.projectMember.delete({
        where: { userId_projectId: { userId, projectId } },
    });

    return NextResponse.json({ success: true });
}