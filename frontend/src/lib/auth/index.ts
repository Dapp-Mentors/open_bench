// src/lib/auth/index.ts
//
// NextAuth.js v5 (next-auth@beta) configuration.
// Supports: Google OAuth, GitHub OAuth, Passkeys (WebAuthn).
// OAuth client IDs & secrets are read from the AppSettings table
// (configured through the setup wizard) instead of env vars.
// Session strategy: JWT — required so that middleware (edge runtime)
// can verify sessions without a database connection.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma/client";
import type { Role } from "@prisma/client";

// We read client IDs/secrets from the DB at build/startup.
// If the DB row doesn't exist yet, auth providers will be disabled
// until the setup wizard is completed.
async function getProviderConfig() {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: "default" },
      select: {
        googleClientId: true,
        googleClientSecret: true,
        githubClientId: true,
        githubClientSecret: true,
      },
    });
    return settings;
  } catch {
    return null;
  }
}

export async function createAuthConfig() {
  const providerConfig = await getProviderConfig();

  const providers = [];

  if (providerConfig?.googleClientId && providerConfig?.googleClientSecret) {
    providers.push(
      Google({
        clientId: providerConfig.googleClientId,
        clientSecret: providerConfig.googleClientSecret,
        authorization: {
          params: {
            scope: "openid email profile",
            prompt: "select_account",
          },
        },
        allowDangerousEmailAccountLinking: true,
      })
    );
  }

  if (providerConfig?.githubClientId && providerConfig?.githubClientSecret) {
    providers.push(
      GitHub({
        clientId: providerConfig.githubClientId,
        clientSecret: providerConfig.githubClientSecret,
        allowDangerousEmailAccountLinking: true,
      })
    );
  }

  // Always include passkey credentials provider
  providers.push(
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
    })
  );

  return {
    adapter: PrismaAdapter(prisma),
    session: { strategy: "jwt" as const },
    providers,
    pages: {
      signIn: "/login",
      error: "/login",
    },
    callbacks: {
      async jwt({ token, user }: { token: any; user?: any }) {
        if (user) {
          token.id = user.id;
          token.role = (user as { role: Role }).role;
        }
        return token;
      },
      async session({ session, token }: { session: any; token: any }) {
        if (session.user) {
          session.user.id = token.id as string;
          session.user.role = token.role as Role;
        }
        return session;
      },
      async signIn() {
        return true;
      },
    },
    events: {
      async createUser({ user }: { user: any }) {
        console.log(`[auth] New user created: ${user.email}`);
        try {
          const count = await prisma.user.count();
          if (count === 1) {
            await prisma.user.update({
              where: { id: user.id! },
              data: { role: "super_admin" },
            });
            console.log(`[auth] First user promoted to super_admin: ${user.email}`);
          }
        } catch (err) {
          console.error(`[auth] Failed to check/promote first user:`, err);
        }
      },
    },
  };
}

// Export a lazily-initialised auth that reads config from DB on first call.
let _auth: ReturnType<typeof NextAuth> | null = null;

async function getAuth() {
  if (!_auth) {
    const config = await createAuthConfig();
    _auth = NextAuth(config);
  }
  return _auth;
}

// Re-export the standard NextAuth helpers. They internally call getAuth().
// auth() can be called with no arguments (default middleware usage) or with a request.
export async function auth(...args: any[]) {
  const a = await getAuth();
  return (a.auth as any)(...args);
}

// Handlers are wrapped to lazily initialise NextAuth with DB provider config.
// NextAuth v5 route handlers accept (req, ctx) but some overloads only accept req.
// We directly invoke the response without spreading ctx to avoid type mismatches.
export const handlers = {
  GET: async (req: Request, ...rest: any[]) => {
    const a = await getAuth();
    // The handlers may accept 1 or 2 arguments; cast to Function to work with both
    return (a.handlers.GET as any)(req, ...rest);
  },
  POST: async (req: Request, ...rest: any[]) => {
    const a = await getAuth();
    return (a.handlers.POST as any)(req, ...rest);
  },
};

export async function signIn(...args: Parameters<ReturnType<typeof NextAuth>["signIn"]>) {
  const a = await getAuth();
  return a.signIn(...args);
}

export async function signOut(...args: Parameters<ReturnType<typeof NextAuth>["signOut"]>) {
  const a = await getAuth();
  return a.signOut(...args);
}