// src/proxy.ts
//
// Next.js 16 proxy (middleware replacement) for auth + role-based routing.
// Uses jose to verify JWT tokens directly on the edge runtime — no Prisma dependency.
// The AUTH_SECRET env var must be set for JWT verification.

import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";

type Role = "user" | "admin" | "super_admin";

const ROLE_RANK: Record<Role, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
};

function hasRole(userRole: Role, required: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[required];
}

// Routes fully open to the public (no auth required)
const PUBLIC_PATHS = ["/", "/whitepaper", "/login", "/unauthorized", "/api/auth", "/api/inngest"];

// Routes related to setup — always accessible regardless of setup status
const SETUP_PATHS = ["/setup", "/api/setup"];

// Routes that require super_admin
const SUPER_ADMIN_PATHS = ["/admin/models", "/api/models"];

// Routes that require admin
const ADMIN_PATHS = ["/admin", "/api/admin"];

// Admin-only page routes — exact match only so /projects/[id] is open to members
const ADMIN_PAGE_PATHS = ["/projects", "/projects/new"];

function matchesAny(pathname: string, patterns: string[]): boolean {
  return patterns.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}

function matchesExact(pathname: string, patterns: string[]): boolean {
  return patterns.some((p) => pathname === p);
}

// Decode the NextAuth.js JWT session token from the request cookie
async function getSession(req: NextRequest): Promise<{ id?: string; role?: Role } | null> {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
  if (!secret.length) return null;

  // NextAuth.js v5 uses the "authjs.session-token" cookie by default
  const cookieName = "authjs.session-token";
  const token = req.cookies.get(cookieName)?.value ?? req.cookies.get("__Secure-authjs.session-token")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      id: (payload as any).id as string | undefined,
      role: (payload as any).role as Role | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Check whether the application setup has been completed by calling the
 * internal /api/setup/status endpoint. Returns true if setup is complete
 * or if the check fails (fail-open for robustness once setup is known done).
 *
 * This runs on every non-setup request, but only during the brief bootstrap
 * window — once setup is done, the proxy will cache the result implicitly
 * via the redirect being skipped.
 */
async function isSetupComplete(req: NextRequest): Promise<boolean> {
  try {
    const statusUrl = new URL("/api/setup/status", req.url);
    const res = await fetch(statusUrl, {
      // Forward cookies so the setup status endpoint can authenticate if needed
      headers: { cookie: req.headers.get("cookie") ?? "" },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.setupComplete === true;
  } catch {
    // If we can't reach the status endpoint (e.g. cold start, prerender),
    // be conservative: assume setup is NOT complete and redirect to /setup.
    // Once setup is truly done, this endpoint will always respond.
    return false;
  }
}

export default async function proxy(req: NextRequest, _event: NextFetchEvent) {
  const { pathname } = req.nextUrl;

  // ── Setup guard ────────────────────────────────────────────────────────────
  // If setup is NOT complete, redirect EVERY request to the setup wizard,
  // *except* requests to /setup, /api/setup, and static Next.js internals
  // (which are already excluded by the matcher).
  //
  // This ensures the first user is always funneled into the setup flow and
  // cannot accidentally land on any page (login, home, dashboard, etc.)
  // before the application has been bootstrapped.
  if (!matchesAny(pathname, SETUP_PATHS)) {
    const complete = await isSetupComplete(req);
    if (!complete) {
      return NextResponse.redirect(new URL("/setup", req.url));
    }
  }

  // Allow setup paths through unconditionally (they handle their own logic)
  if (matchesAny(pathname, SETUP_PATHS)) {
    return NextResponse.next();
  }

  // Always allow public paths
  if (matchesAny(pathname, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  // Get session from JWT cookie
  const session = await getSession(req);

  // Everything else needs at least a valid session
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const userRole = session.role ?? "user";

  // Super-admin-only paths
  if (matchesAny(pathname, SUPER_ADMIN_PATHS)) {
    if (!hasRole(userRole, "super_admin")) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // Admin-only API routes
  if (matchesAny(pathname, ADMIN_PATHS)) {
    if (!hasRole(userRole, "admin")) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // Admin-only pages (exact match — /projects/[id] is open to members)
  if (matchesExact(pathname, ADMIN_PAGE_PATHS)) {
    if (!hasRole(userRole, "admin")) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // Default: any authenticated user can proceed
  return NextResponse.next();
}

export const config = {
  // Match everything except static files and Next.js internals
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};