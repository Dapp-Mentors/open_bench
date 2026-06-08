// src/lib/inngest/client.ts
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "openbench",
  name: "OpenBench",
  // When running locally outside Docker, INNGEST_BASE_URL won't resolve
  // "inngest:8288". We fall back to localhost:8288 where the container
  // is port-mapped to on your machine.
  baseUrl: process.env.INNGEST_BASE_URL?.replace(
    "http://inngest:",
    "http://localhost:",
  ),
});