// src/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "OpenBench",
  description: "Open infrastructure for reproducible AI benchmark curation and evaluation",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Fetch session server-side and pass to SessionProviderWrapper so client components
  // get the session immediately without an extra round-trip.
  let session = null;
  try {
    session = await auth();
  } catch {
    // auth() may fail in prerendered contexts (e.g. _not-found, error pages)
    session = null;
  }

  return (
    <html lang="en">
      <body className="noise scanlines">
        <SessionProviderWrapper session={session}>
          <NavBar />
          <main>{children}</main>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}