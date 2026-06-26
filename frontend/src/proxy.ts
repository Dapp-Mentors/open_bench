// src/proxy.ts
// Next.js middleware for auth + role-based routing.

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

const PUBLIC_PATHS = [
  "/",
  "/whitepaper",
  "/login",
  "/unauthorized",
  "/api/auth",
  "/api/inngest",
  "/api/sia",
  "/api/health",
];

const SETUP_PATHS = ["/setup", "/api/setup"];
const SUPER_ADMIN_PATHS = ["/admin/models", "/admin/misc", "/admin/environment", "/api/models"];
const ADMIN_PATHS = ["/admin", "/api/admin"];
const ADMIN_PAGE_PATHS = ["/projects", "/projects/new"];

function matchesAny(pathname: string, patterns: string[]): boolean {
  return patterns.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?")
  );
}

function matchesExact(pathname: string, patterns: string[]): boolean {
  return patterns.some((p) => pathname === p);
}

function getPublicOrigin(req: NextRequest): string {
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    req.nextUrl.host;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    req.nextUrl.protocol?.replace(":", "") ??
    "http";
  return `${proto}://${host}`;
}

const DEFAULT_AUTH_SECRET = "lTtDZlfpNjrSIA2EocS7GEAaH3SHLsOr41X4udYY1k4=";

async function getSession(req: NextRequest): Promise<{ id?: string; role?: Role } | null> {
  const secret = process.env.AUTH_SECRET || DEFAULT_AUTH_SECRET;
  if (!secret) return null;

  const SECURE_COOKIE = "__Secure-authjs.session-token";
  const PLAIN_COOKIE = "authjs.session-token";

  const secureCookieValue = req.cookies.get(SECURE_COOKIE)?.value;
  const plainCookieValue = req.cookies.get(PLAIN_COOKIE)?.value;

  const token = secureCookieValue ?? plainCookieValue;
  const salt = secureCookieValue ? SECURE_COOKIE : PLAIN_COOKIE;

  if (!token) return null;

  try {
    const payload = await decode({
      token,
      secret,
      salt,
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
  const origin = getPublicOrigin(req);

  if (matchesAny(pathname, SETUP_PATHS)) {
    return NextResponse.next();
  }

  if (matchesAny(pathname, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  const setupDone = req.cookies.get("setup_complete")?.value === "true";
  if (!setupDone) {
    return NextResponse.redirect(new URL("/setup", origin));
  }

  const session = await getSession(req);
  if (!session) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("callbackUrl", `${origin}${pathname}`);
    return NextResponse.redirect(loginUrl);
  }

  const userRole = session.role ?? "user";

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

  if (matchesExact(pathname, ADMIN_PAGE_PATHS)) {
    if (!hasRole(userRole, "admin")) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};