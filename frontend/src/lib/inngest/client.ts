// src/lib/inngest/client.ts
import { Inngest } from 'inngest'

// Inside Docker, INNGEST_BASE_URL is "http://inngest:8288" and resolves correctly.
// Outside Docker (local `next dev`), "inngest" isn't a known hostname, so we
// rewrite it to localhost — but only when not running in a container.
function resolveInngestUrl(): string | undefined {
  const url = process.env.INNGEST_BASE_URL
  if (!url) return undefined
  // RUNNING_IN_DOCKER is set in the frontend service environment below
  if (process.env.RUNNING_IN_DOCKER === '1') return url
  return url.replace('http://inngest:', 'http://localhost:')
}

export const inngest = new Inngest({
  id: 'openbench',
  name: 'OpenBench',
  baseUrl: resolveInngestUrl(),
})
