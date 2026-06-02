import { NextRequest, NextResponse } from "next/server";

// Stub — replace with full Prisma + Inngest implementation
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.title?.trim() || !body.description?.trim()) {
    return NextResponse.json({ error: "title and description are required" }, { status: 400 });
  }
  // TODO: prisma.task.create + inngest.send
  return NextResponse.json({ taskId: "stub-task-id" }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  // TODO: prisma.task.findMany
  return NextResponse.json([]);
}
