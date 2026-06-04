import { NextResponse } from "next/server";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // TODO: prisma.task.findUnique with pipelineLogs + runs
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
