// src/app/api/setup/status/route.ts
// Returns the current setup wizard status for the application.
// GET  — returns setup status AND plants the setup_complete cookie if true
// POST — marks setup as complete in the DB, also plants the cookie
//
// The cookie is the signal the edge middleware (proxy.ts) uses to decide
// whether to allow traffic through. Since the middleware cannot use Prisma,
// it reads this lightweight cookie instead. The cookie is planted by BOTH
// GET and POST so that:
//   - Fresh setups: POST at the end of the wizard plants it
//   - Existing completed setups: GET on first /setup page load plants it,
//     then the page redirects to /dashboard which the middleware now allows

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function withSetupCookie(res: NextResponse): NextResponse {
  res.cookies.set("setup_complete", "true", {
    httpOnly: true,    // not needed by JS — only read by middleware via req.cookies
    sameSite: "lax",
    path: "/",
    // No maxAge → session cookie (clears on browser close).
    // Add `secure: true` for HTTPS production deployments.
  });
  return res;
}

export async function GET() {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: "default" },
    });

    const userCount = await prisma.user.count();

    const payload = {
      setupComplete: settings?.setupComplete ?? false,
      siaConnected: settings?.siaConnected ?? false,
      siaIndexerUrl: settings?.siaIndexerUrl ?? null,
      siaAppId: settings?.siaAppId ?? null,
      siaAppName: settings?.siaAppName ?? null,
      siaAppDescription: settings?.siaAppDescription ?? null,
      hasOpenrouterKey: settings?.openrouterKey ? true : false,
      userCount,
    };

    const res = NextResponse.json(payload);

    // Plant the cookie proactively whenever the DB confirms setup is done.
    // This self-heals existing deployments that completed setup before the
    // cookie mechanism existed — their first visit to /setup will hit this
    // GET, receive the cookie, and the middleware will let them through.
    if (payload.setupComplete) {
      withSetupCookie(res);
    }

    return res;
  } catch {
    // Table may not exist yet (fresh DB)
    return NextResponse.json({
      setupComplete: false,
      siaConnected: false,
      siaAppId: null,
      hasOpenrouterKey: false,
      userCount: 0,
    });
  }
}

export async function POST() {
  try {
    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: { setupComplete: true },
      create: {
        id: "default",
        setupComplete: true,
        siaConnected: false,
        openrouterKey: null,
      },
    });

    return withSetupCookie(NextResponse.json({ ok: true }));
  } catch (error) {
    console.error("[SETUP] Failed to mark complete:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}