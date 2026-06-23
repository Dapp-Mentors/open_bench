// src/proxy.ts
//
// Next.js middleware for auth + role-based routing.
//
// FIXES:
//   1. /api/auth/callback/* added to PUBLIC_PATHS.
//      NextAuth's OAuth callback sets the session cookie in its redirect
//      response. If middleware intercepts that redirect and checks for a
//      session before the browser has stored the cookie, it sees no session
//      and bounces to /login. Letting callback URLs pass through untouched
//      means the browser stores the cookie first, and the very next request
//      (to /dashboard or callbackUrl) has the cookie the middleware expects.
//
//   2. /setup and /api/setup always pass through so the self-healing
//      setup_complete cookie flow works on first visit.

import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { decode } from "@auth/core/jwt";

type Role = "user" | "admin" | "super_admin";

const ROLE_RANK: Record<Role, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
};

function hasRole(userRole: Role, required: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[required];
}

// Always open — no auth required, no setup check
const PUBLIC_PATHS = [
  "/",
  "/whitepaper",
  "/login",
  "/unauthorized",
  "/api/auth",       // covers /api/auth/signin, /api/auth/csrf, /api/auth/session …
  "/api/inngest",
  "/api/sia",        // Sia status/events — no auth needed for connection checks
  "/api/health",     // Health check endpoint
];

// Setup paths — always pass through so the self-healing cookie flow can run
const SETUP_PATHS = ["/setup", "/api/setup"];

// Role-gated paths
const SUPER_ADMIN_PATHS = ["/admin/models", "/api/models"];
const ADMIN_PATHS = ["/admin", "/api/admin"];
const ADMIN_PAGE_PATHS = ["/projects", "/projects/new"]; // exact match — /projects/[id] is open

function matchesAny(pathname: string, patterns: string[]): boolean {
  return patterns.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?")
  );
}

function matchesExact(pathname: string, patterns: string[]): boolean {
  return patterns.some((p) => pathname === p);
}

async function getSession(req: NextRequest): Promise<{ id?: string; role?: Role } | null> {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) return null;

  // NextAuth v5 uses "authjs.session-token" (HTTP) or "__Secure-authjs.session-token" (HTTPS)
  const token =
    req.cookies.get("authjs.session-token")?.value ??
    req.cookies.get("__Secure-authjs.session-token")?.value;
  if (!token) return null;

  try {
    // Use @auth/core/jwt decode which handles the HKDF key derivation,
    // kid/thumbprint matching, and the JWE decryption algorithm correctly.
    const payload = await decode({
      token,
      secret,
      salt: "authjs.session-token",
    });
    return {
      id: (payload as any).id as string | undefined,
      role: (payload as any).role as Role | undefined,
    };
  } catch {
    return null;
  }
}

export default async function proxy(req: NextRequest, _event: NextFetchEvent) {
  const { pathname } = req.nextUrl;

  // ── 1. Setup paths always pass through ────────────────────────────────────
  if (matchesAny(pathname, SETUP_PATHS)) {
    return NextResponse.next();
  }

  // ── 2. Public paths (including all of /api/auth/**) ───────────────────────
  // /api/auth must be fully public so OAuth callbacks can complete and write
  // the session cookie to the browser before any auth check runs.
  // IMPORTANT: This check MUST come before the setup guard so that OAuth
  // callbacks can complete even when the setup_complete cookie is missing
  // (e.g. after browser restart, or on first visit after setup).
  if (matchesAny(pathname, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  // ── 3. Setup guard ─────────────────────────────────────────────────────────
  // Cookie is set by GET/POST /api/setup/status when DB confirms completion.
  // /setup page always loads (step 1 above), calls the API, and the API
  // plants the cookie — self-healing for existing completed installations.
  const setupDone = req.cookies.get("setup_complete")?.value === "true";
  if (!setupDone) {
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  // ── 4. Auth check ──────────────────────────────────────────────────────────
  const session = await getSession(req);
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const userRole = session.role ?? "user";

  // ── 5. Role gates ──────────────────────────────────────────────────────────
  if (matchesAny(pathname, SUPER_ADMIN_PATHS)) {
    if (!hasRole(userRole, "super_admin")) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  if (matchesAny(pathname, ADMIN_PATHS)) {
    if (!hasRole(userRole, "admin")) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // Exact match — /projects/[id] stays open to any authenticated user
  if (matchesExact(pathname, ADMIN_PAGE_PATHS)) {
    if (!hasRole(userRole, "admin")) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // ── 6. Default: authenticated ─────────────────────────────────────────────
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};