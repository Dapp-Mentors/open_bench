import { NextResponse } from "next/server";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // TODO: prisma.benchmarkRun.findUnique with logs
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
