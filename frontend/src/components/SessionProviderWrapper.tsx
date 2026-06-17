"use client";

// src/components/SessionProviderWrapper.tsx
//
// Client-side wrapper for next-auth's SessionProvider.
// The root layout uses this to avoid "React Context is unavailable in Server Components".
// Also includes a redirect guard that sends unauthenticated users to /login.

import { SessionProvider, signOut } from "next-auth/react";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Session } from "next-auth";

// Public paths that don't require authentication
const PUBLIC_PATHS = ["/login", "/unauthorized"];

export function SessionProviderWrapper({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // This component is mounted inside SessionProvider, so useSession()
    // will work. We use a simple fetch to /api/auth/session to check
    // auth status in client components.
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return;

    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user) {
          router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
        }
      })
      .catch(() => {});
  }, [pathname, router]);

  return <>{children}</>;
}