// src/lib/auth/guards.ts
//
// Server-side role helpers. Import these in API routes and Server Components.
// Client-side use: read session.user.role from useSession().

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

// ── Role hierarchy ─────────────────────────────────────────────────────────────

const ROLE_RANK: Record<Role, number> = {
    user: 0,
    admin: 1,
    super_admin: 2,
};

export function hasRole(userRole: Role, required: Role): boolean {
    return ROLE_RANK[userRole] >= ROLE_RANK[required];
}

// ── Server Component guards (call at the top of a page/layout) ────────────────

/** Redirect to /login if not authenticated at all. */
export async function requireAuth() {
    const session = await auth();
    if (!session?.user) redirect("/login");
    return session;
}

/** Redirect to /unauthorized if the user doesn't have the required role. */
export async function requireRole(role: Role) {
    const session = await requireAuth();
    const userRole = session.user.role as Role;
    if (!hasRole(userRole, role)) redirect("/unauthorized");
    return session;
}

// ── API route guards (return 401/403 instead of redirecting) ──────────────────

export type AuthResult =
    | { ok: true; userId: string; role: Role }
    | { ok: false; status: 401 | 403; message: string };

/** Verify auth and role for API routes. */
export async function checkApiAuth(required?: Role): Promise<AuthResult> {
    const session = await auth();

    if (!session?.user?.id) {
        return { ok: false, status: 401, message: "Not authenticated" };
    }

    const userRole = (session.user.role ?? "user") as Role;

    if (required && !hasRole(userRole, required)) {
        return {
            ok: false,
            status: 403,
            message: `Requires role: ${required}. Your role: ${userRole}`,
        };
    }

    return { ok: true, userId: session.user.id, role: userRole };
}

// ── Convenience wrappers ───────────────────────────────────────────────────────

export async function requireAdmin() {
    return requireRole("admin");
}

export async function requireSuperAdmin() {
    return requireRole("super_admin");
}

export async function checkAdmin(): Promise<AuthResult> {
    return checkApiAuth("admin");
}

export async function checkSuperAdmin(): Promise<AuthResult> {
    return checkApiAuth("super_admin");
}