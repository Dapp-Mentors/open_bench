// src/lib/auth/index.ts
// NextAuth.js v5 (next-auth@beta) configuration.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma/client";
import type { Role } from "@prisma/client";

async function getProviderConfig() {
  try {
    return await prisma.appSettings.findUnique({
      where: { id: "default" },
      select: {
        googleClientId: true,
        googleClientSecret: true,
        githubClientId: true,
        githubClientSecret: true,
      },
    });
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
          params: { scope: "openid email profile", prompt: "select_account" },
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

  providers.push(
    Credentials({
      id: "passkey",
      name: "Passkey",
      credentials: { userId: { label: "User ID", type: "text" } },
      async authorize(credentials) {
        if (!credentials?.userId) return null;
        const user = await prisma.user.findUnique({
          where: { id: credentials.userId as string },
        });
        if (!user) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role, image: user.image };
      },
    })
  );

  const DEFAULT_AUTH_SECRET = "lTtDZlfpNjrSIA2EocS7GEAaH3SHLsOr41X4udYY1k4=";

  return {
    adapter: PrismaAdapter(prisma),
    session: { strategy: "jwt" as const },
    secret: process.env.AUTH_SECRET || DEFAULT_AUTH_SECRET,
    trustHost: process.env.AUTH_TRUST_HOST !== "0",
    providers,
    pages: { signIn: "/login", error: "/login" },
    callbacks: {
      async jwt({ token, user }: { token: any; user?: any }) {
        if (user) {
          token.id = user.id;
          const fresh = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
          token.role = fresh?.role ?? user.role ?? "user";
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

// Cache with config-fingerprint invalidation

let _auth: ReturnType<typeof NextAuth> | null = null;
let _configFingerprint: string | null = null;

async function configFingerprint(): Promise<string> {
  const cfg = await getProviderConfig();
  return JSON.stringify({
    g: cfg?.googleClientId ?? "",
    gh: cfg?.githubClientId ?? "",
  });
}

async function getAuth() {
  const fp = await configFingerprint();
  if (!_auth || fp !== _configFingerprint) {
    const config = await createAuthConfig();
    _auth = NextAuth(config);
    _configFingerprint = fp;
  }
  return _auth;
}

// Exports

export async function auth(...args: any[]) {
  const a = await getAuth();
  return (a.auth as any)(...args);
}

export const handlers = {
  GET: async (req: Request, ...rest: any[]) => {
    const a = await getAuth();
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