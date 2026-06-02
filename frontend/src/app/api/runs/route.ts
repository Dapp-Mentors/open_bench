import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { taskId, agentConfig } = await req.json();
  if (!taskId || !agentConfig?.provider || !agentConfig?.modelId) {
    return NextResponse.json({ error: "taskId and agentConfig are required" }, { status: 400 });
  }
  // TODO: prisma.benchmarkRun.create + inngest.send
  return NextResponse.json({ runId: "stub-run-id" }, { status: 201 });
}

export async function GET() {
  // TODO: prisma.benchmarkRun.findMany
  return NextResponse.json([]);
}
