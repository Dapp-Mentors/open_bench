// lib/uploads.ts
//
// Uploads-directory resolution.
//
// Default (local dev):  <project_root>/uploads  (e.g. frontend/uploads/)
// Docker:               UPLOADS_DIR=/uploads     (set in docker-compose.yml)
// Override:             UPLOADS_DIR=/any/path    (explicit env var)

import { join } from 'path'

function getUploadsDir(): string {
  const envDir = process.env.UPLOADS_DIR
  if (envDir) return envDir

  // Default to a local directory under the frontend/ project root.
  // process.cwd() is the frontend/ directory when running `yarn dev`.
  return join(process.cwd(), 'uploads')
}

export const UPLOADS_DIR = getUploadsDir()
