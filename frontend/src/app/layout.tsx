// src/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "OpenBench",
  description: "An AI dataset curation and evaluation platform for AI model trainings",
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
          {/*
            On desktop (lg+) the sidebar is a fixed 64px rail.
            Offset main content so it isn't hidden under the rail.
            On mobile (<lg) the sidebar is an overlay drawer — no offset needed.
          */}
          <main className="lg:pl-16">{children}</main>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}