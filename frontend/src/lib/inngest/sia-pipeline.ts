// lib/inngest/sia-pipeline.ts
//
// Inngest function that pushes an approved task's asset to the Sia network.
// Triggered by the 'sia/task.approved' event, fired immediately after an
// admin clicks "Approve Task".
//
// Steps (mirroring the UI shown in the screenshot):
//   1. queued      — event received, starting upload
//   2. uploading   — POST /api/sia/upload  (encrypts + shards file to Sia)
//   3. pinning     — POST /api/sia/pin     (registers object with indexer node)
//   4. registering — POST /api/sia/register (creates indexd metadata record)
//   5. ready       — all done; siaHash + indexdKey written back to Task
//
// On any failure, siaStatus is set to "failed" and a SiaLog row is written
// with passed=false and the error message.

import { inngest } from './client'
import { prisma } from '@/lib/prisma'

// ── Helper: resolve backend URL ───────────────────────────────────────────────
function resolveBackendUrl(): string {
  const url = process.env.BACKEND_URL ?? 'http://backend:8000'
  if (process.env.RUNNING_IN_DOCKER === '1') return url
  return url.replace('http://backend:', 'http://localhost:')
}

// ── Helper: write a SiaLog row ────────────────────────────────────────────────
async function logSiaStep(
  taskId: string,
  step: string,
  passed: boolean,
  message: string,
) {
  await prisma.siaLog.create({
    data: { taskId, step, passed, message },
  })
}

// ── Helper: call a Sia backend endpoint ──────────────────────────────────────
async function callSiaBackend(
  endpoint: string,
  taskId: string,
  storagePath: string,
  extra?: Record<string, unknown>,
): Promise<{ passed: boolean; message: string; siaHash?: string; indexdKey?: string }> {
  const backendUrl = resolveBackendUrl()
  const res = await fetch(`${backendUrl}/api/sia/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, storagePath, ...extra }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Backend /sia/${endpoint} returned ${res.status}: ${text}`)
  }

  return res.json()
}

// ── The Inngest Sia push function ─────────────────────────────────────────────
export const pushToSia = inngest.createFunction(
  { id: 'sia-push', name: 'Push approved task to Sia network' },
  { event: 'sia/task.approved' },

  async ({ event, step }) => {
    const { taskId, storagePath } = event.data

    // ── Step 1: Mark as queued ────────────────────────────────────────────────
    await step.run('sia-queued', async () => {
      await Promise.all([
        prisma.task.update({
          where: { id: taskId },
          data: { siaStatus: 'queued' },
        }),
        logSiaStep(taskId, 'queued', true, 'Upload queued — waiting to start'),
      ])
    })

    // ── Step 2: Upload to Sia (encrypt + shard) ───────────────────────────────
    const uploadResult = await step.run('sia-uploading', async () => {
      await prisma.task.update({
        where: { id: taskId },
        data: { siaStatus: 'uploading' },
      })

      try {
        const result = await callSiaBackend('upload', taskId, storagePath)
        await logSiaStep(taskId, 'uploading', result.passed, result.message)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await Promise.all([
          logSiaStep(taskId, 'uploading', false, msg),
          prisma.task.update({ where: { id: taskId }, data: { siaStatus: 'failed' } }),
        ])
        throw err
      }
    })

    if (!uploadResult.passed) {
      await prisma.task.update({ where: { id: taskId }, data: { siaStatus: 'failed' } })
      return { taskId, result: 'failed', step: 'uploading' }
    }

    // ── Step 3: Pin on Indexer ────────────────────────────────────────────────
    const pinResult = await step.run('sia-pinning', async () => {
      await prisma.task.update({
        where: { id: taskId },
        data: { siaStatus: 'pinning' },
      })

      try {
        const result = await callSiaBackend('pin', taskId, storagePath, {
          siaHash: uploadResult.siaHash,
        })
        await logSiaStep(taskId, 'pinning', result.passed, result.message)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await Promise.all([
          logSiaStep(taskId, 'pinning', false, msg),
          prisma.task.update({ where: { id: taskId }, data: { siaStatus: 'failed' } }),
        ])
        throw err
      }
    })

    if (!pinResult.passed) {
      await prisma.task.update({ where: { id: taskId }, data: { siaStatus: 'failed' } })
      return { taskId, result: 'failed', step: 'pinning' }
    }

    // ── Step 4: Register on Indexd ────────────────────────────────────────────
    const registerResult = await step.run('sia-registering', async () => {
      await prisma.task.update({
        where: { id: taskId },
        data: { siaStatus: 'registering' },
      })

      try {
        const result = await callSiaBackend('register', taskId, storagePath, {
          siaHash: uploadResult.siaHash,
        })
        await logSiaStep(taskId, 'registering', result.passed, result.message)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await Promise.all([
          logSiaStep(taskId, 'registering', false, msg),
          prisma.task.update({ where: { id: taskId }, data: { siaStatus: 'failed' } }),
        ])
        throw err
      }
    })

    if (!registerResult.passed) {
      await prisma.task.update({ where: { id: taskId }, data: { siaStatus: 'failed' } })
      return { taskId, result: 'failed', step: 'registering' }
    }

    // ── Step 5: Mark ready — write back siaHash + indexdKey ───────────────────
    await step.run('sia-ready', async () => {
      await Promise.all([
        prisma.task.update({
          where: { id: taskId },
          data: {
            siaStatus: 'ready',
            siaHash: uploadResult.siaHash ?? registerResult.siaHash ?? null,
            indexdKey: registerResult.indexdKey ?? null,
          },
        }),
        logSiaStep(taskId, 'ready', true, 'Asset pinned and downloadable on Sia'),
      ])
    })

    return { taskId, result: 'ready' }
  },
)
