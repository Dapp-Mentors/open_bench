// src/app/page.tsx
//
// Root page — redirects authenticated users to the dashboard and
// unauthenticated users to the login page.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }
  redirect("/login");
}