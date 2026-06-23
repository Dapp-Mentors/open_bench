// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
  runPipeline,
  runBenchmark,
  pipelineWatchdog,
  cleanupWatchdog,
} from "@/lib/inngest/pipeline-inngest";

// In dev mode (INNGEST_DEV=1 or signing key is the default "local"),
// the Inngest dev server does not sign requests with x-inngest-signature.
// We must skip signature validation to avoid "No x-inngest-signature provided" errors.
const signingKey =
  process.env.INNGEST_DEV === "1" || process.env.INNGEST_SIGNING_KEY === "local"
    ? undefined
    : process.env.INNGEST_SIGNING_KEY;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runPipeline, runBenchmark, pipelineWatchdog, cleanupWatchdog],
  signingKey,
});
