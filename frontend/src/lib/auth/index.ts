// src/lib/auth/index.ts
//
// NextAuth.js v5 (next-auth@beta) configuration.
// Supports: Google OAuth, GitHub OAuth, Passkeys (WebAuthn).
// Session strategy: JWT — required so that middleware (edge runtime)
// can verify sessions without a database connection.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma/client";
import type { Role } from "@prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),

    // JWT strategy keeps session data in a signed cookie so the middleware
    // (which runs on the edge runtime) can decode it without Prisma.
    session: { strategy: "jwt" },

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

        // Credentials provider for passkey (WebAuthn) authentication.
        // The authorize callback receives the user id from the passkey route
        // and returns the user to create a proper JWT session.
        Credentials({
            id: "passkey",
            name: "Passkey",
            credentials: {
                userId: { label: "User ID", type: "text" },
            },
            async authorize(credentials) {
                if (!credentials?.userId) return null;

                const user = await prisma.user.findUnique({
                    where: { id: credentials.userId as string },
                });

                if (!user) return null;

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    image: user.image,
                };
            },
        }),
    ],

    pages: {
        signIn: "/login",
        error: "/login",  // auth errors redirect to the login page with ?error=
    },

    callbacks: {
        // Persist user id + role into the JWT token so middleware can read them
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = (user as { role: Role }).role;
            }
            return token;
        },

        // Attach role to the session from the JWT token
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as Role;
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