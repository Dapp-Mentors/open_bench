import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  // TODO: prisma.benchmarkRun.findUnique with logs
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
