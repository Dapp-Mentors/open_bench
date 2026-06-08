// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runPipeline, runBenchmark } from "@/lib/inngest/pipeline-inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runPipeline, runBenchmark],
});