// src/lib/auth/index.ts
//
// NextAuth.js v5 (next-auth@beta) configuration.
// Supports: Google OAuth, GitHub OAuth, Passkeys (WebAuthn).
// Session strategy: database (sessions stored in Postgres via Prisma adapter).

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma/client";
import type { Role } from "@prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),

    // Database sessions keep the session token in Postgres, not a JWT.
    // This means we can invalidate sessions server-side instantly.
    session: { strategy: "database" },

    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            // Request the profile and email scopes — enough for our use case
            authorization: {
                params: {
                    scope: "openid email profile",
                    prompt: "select_account",  // always show account picker
                },
            },
            // Allow a single email to be linked to multiple OAuth providers
            // (e.g. sign up with GitHub, then also sign in with Google)
            allowDangerousEmailAccountLinking: true,
        }),

        GitHub({
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
            // Allow a single email to be linked to multiple OAuth providers
            allowDangerousEmailAccountLinking: true,
        }),
    ],

    pages: {
        signIn: "/login",
        error: "/login",  // auth errors redirect to the login page with ?error=
    },

    callbacks: {
        // Attach role to the session so the frontend can read it without hitting the DB
        async session({ session, user }) {
            if (session.user && user) {
                session.user.id = user.id;
                session.user.role = (user as { role: Role }).role;
            }
            return session;
        },

        // Block sign-in if you want to allowlist domains in the future.
        // Right now everyone can sign in; role assignment happens separately.
        async signIn() {
            return true;
        },
    },

    events: {
        // When a brand-new user signs up, default role is already "user" via Prisma default.
        // You can hook here to send a welcome email or notify admins.
        async createUser({ user }) {
            console.log(`[auth] New user created: ${user.email}`);
        },
    },
});