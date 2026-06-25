// src/app/api/auth/[...nextauth]/route.ts
//
// NextAuth.js v5 catch-all route. Handles:
//   GET/POST /api/auth/signin
//   GET/POST /api/auth/signout
//   GET/POST /api/auth/callback/google
//   GET/POST /api/auth/callback/github
//   GET      /api/auth/session
//   GET      /api/auth/csrf
//
// FIX: Rewrite the request URL with the public origin from the Host header
// before passing to NextAuth. In Docker / Codespaces, req.url contains the
// internal container hostname (e.g. "http://d5ed6c74d388:3000/...").
// NextAuth uses req.url to build the OAuth redirect_uri, which causes
// Google to reject it with "Error 400: invalid_request" because the
// redirect_uri doesn't match the registered one.
//
// By rewriting the URL with the public Host / x-forwarded-host, the
// redirect_uri becomes correct (e.g. "https://my-app-3000.preview.app.github.dev/...").

import { handlers } from "@/lib/auth";

function rewriteUrl(req: Request): Request {
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ?? 
    "localhost:3000";
  
  const proto =
    req.headers.get("x-forwarded-proto") ?? 
    (host.includes("localhost") || host.includes("0.0.0.0") ? "http" : "https");

  const url = new URL(req.url);
  const publicOrigin = `${proto}://${host}`;
  
  // Only rewrite if the URL doesn't already use the public origin
  if (url.origin !== publicOrigin) {
    const newUrl = `${publicOrigin}${url.pathname}${url.search}`;
    return new Request(newUrl, req);
  }
  
  return req;
}

async function withPublicUrl(handler: (req: Request, ...rest: any[]) => Promise<Response>) {
  return async (req: Request, ...rest: any[]) => {
    return handler(rewriteUrl(req), ...rest);
  };
}

export const GET = withPublicUrl(handlers.GET);
export const POST = withPublicUrl(handlers.POST);