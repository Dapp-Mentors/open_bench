// src/app/api/auth/[...nextauth]/route.ts
//
// NextAuth.js v5 catch-all route. Handles:
//   GET/POST /api/auth/signin
//   GET/POST /api/auth/signout
//   GET/POST /api/auth/callback/google
//   GET/POST /api/auth/callback/github
//   GET      /api/auth/session
//   GET      /api/auth/csrf

import { handlers } from "@/lib/auth";

// The handlers are async functions that lazily initialise NextAuth
// with provider config from the database.
export const GET = handlers.GET;
export const POST = handlers.POST;
