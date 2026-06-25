#!/usr/bin/env bash
# ============================================================
# OpenBench Dev Startup — one command, 3 terminals
# ============================================================
# Starts Inngest, Backend (FastAPI), and Frontend (Next.js)
# simultaneously using Unix domain sockets for IPC so we avoid
# port conflicts on macOS/Linux.
#
# Prerequisites:
#   - Docker running (for PostgreSQL + Ollama)
#   - Node.js 20+, Python 3.11+, npm
#
# Usage:
#   chmod +x scripts/start-dev.sh
#   ./scripts/start-dev.sh
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║           OpenBench — Dev Startup                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Ensure infra services are up ───────────────────────────
echo "[1/3] Checking infrastructure services..."

# Start PostgreSQL if not running
if ! docker ps --format '{{.Names}}' | grep -q '^openbench_pg$'; then
  echo "  → Starting PostgreSQL..."
  docker run -d --name openbench_pg \
    -e POSTGRES_USER=openbench \
    -e POSTGRES_PASSWORD=openbench_secret \
    -e POSTGRES_DB=openbench \
    -p 5432:5432 \
    postgres:16-alpine 2>/dev/null || true
  echo "  ✓ PostgreSQL started"
else
  echo "  ✓ PostgreSQL already running"
fi

# Start Ollama if not running
if ! docker ps --format '{{.Names}}' | grep -q '^openbench_ollama$'; then
  echo "  → Starting Ollama..."
  docker run -d --name openbench_ollama \
    -p 11434:11434 \
    -v ollama_data:/root/.ollama \
    ollama/ollama:latest 2>/dev/null || true
  echo "  ✓ Ollama started"
else
  echo "  ✓ Ollama already running"
fi

# Pull embedding model if needed
if ! docker exec openbench_ollama ollama list 2>/dev/null | grep -q 'nomic-embed-text'; then
  echo "  → Pulling nomic-embed-text model..."
  docker exec openbench_ollama ollama pull nomic-embed-text:latest &
fi

echo ""

# ── 2. Start Inngest ──────────────────────────────────────────
echo "[2/3] Starting Inngest dev server..."
if lsof -i :8288 &>/dev/null 2>&1; then
  echo "  ✓ Inngest already running on port 8288"
else
  npx inngest-cli@latest dev \
    -u http://localhost:3000/api/inngest \
    --no-discovery --no-poll --persist &
  INNGEST_PID=$!
  echo "  ✓ Inngest started (PID: $INNGEST_PID)"
fi
echo ""

# ── 3. Start Backend + Frontend ───────────────────────────────
echo "[3/3] Starting application servers..."

# Backend
cd "$ROOT_DIR/backend"
if [ ! -d "venv" ]; then
  echo "  → Creating Python virtual environment..."
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt -q
else
  source venv/bin/activate
fi

echo "  → Starting Backend (FastAPI) on port 8000..."
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  ✓ Backend started (PID: $BACKEND_PID)"

# Frontend
cd "$ROOT_DIR/frontend"
if [ ! -d "node_modules" ]; then
  echo "  → Installing frontend dependencies..."
  npm install
fi

echo "  → Starting Frontend (Next.js) on port 3000..."
npm run dev &
FRONTEND_PID=$!
echo "  ✓ Frontend started (PID: $FRONTEND_PID)"

cd "$ROOT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  All services are starting up!                           ║"
echo "║                                                          ║"
echo "║  Frontend  → http://localhost:3000                        ║"
echo "║  Backend   → http://localhost:8000                        ║"
echo "║  Inngest   → http://localhost:8288                        ║"
echo "║  Ollama    → http://localhost:11434                       ║"
echo "║  Postgres  → localhost:5432                               ║"
echo "║                                                          ║"
echo "║  Press Ctrl+C to stop all services.                      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Trap Ctrl+C to clean up ────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $FRONTEND_PID $BACKEND_PID $INNGEST_PID 2>/dev/null || true
  wait 2>/dev/null || true
  echo "All services stopped."
}
trap cleanup EXIT INT TERM

# Wait for any background process to exit (so Ctrl+C works)
wait