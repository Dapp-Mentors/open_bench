import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextFetchEvent } from "next/server";
import type { Role } from "@prisma/client";
import type { NextAuthRequest } from "next-auth";

const ROLE_RANK: Record<Role, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
};

function hasRole(userRole: Role, required: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[required];
}

// Routes fully open to the public (no auth required)
const PUBLIC_PATHS = ["/", "/login", "/unauthorized", "/api/auth"];

// Routes that require super_admin
const SUPER_ADMIN_PATHS = [
  "/admin/models",
  "/api/models",
];

// Routes that require admin
const ADMIN_PATHS = [
  "/admin",
  "/projects",
  "/api/admin",
  "/api/projects",  // project creation/deletion
];

function matchesAny(pathname: string, patterns: string[]): boolean {
  return patterns.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}

export default auth(function middleware(req: NextAuthRequest, _event: NextFetchEvent) {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Always allow public paths
  if (matchesAny(pathname, PUBLIC_PATHS)) {
    // If already logged in and hitting /login, send to dashboard
    if (pathname === "/login" && session?.user) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Everything else needs at least a valid session
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const userRole = (session.user.role ?? "user") as Role;

  // Super-admin-only paths
  if (matchesAny(pathname, SUPER_ADMIN_PATHS)) {
    if (!hasRole(userRole, "super_admin")) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // Admin-only paths
  if (matchesAny(pathname, ADMIN_PATHS)) {
    if (!hasRole(userRole, "admin")) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // Default: any authenticated user can proceed
  return NextResponse.next();
});

export const config = {
  // Match everything except static files and Next.js internals
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};