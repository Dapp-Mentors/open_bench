// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
  runPipeline,
  runBenchmark,
  pipelineWatchdog,
  cleanupWatchdog,
} from "@/lib/inngest/pipeline-inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runPipeline, runBenchmark, pipelineWatchdog, cleanupWatchdog],
});
