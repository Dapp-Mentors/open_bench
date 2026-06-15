# OpenBench

Open infrastructure for reproducible AI benchmark curation and evaluation. Each task is a realistic command-line challenge — a broken build, a failing service, a bad config. AI agents solve it through the terminal. Tests verify it. Results live on the Sia Network forever.

---

## What it shows

Submit a task ZIP → watch it move through 8 curation pipeline stages → approve it to the registry → run benchmarks against any model → results are content-addressed on Sia Network.

```
Submit → Similarity → CI Checks → Quality → Preflight → Oracle/NOP → Easiness → Difficulty → Agent Quality → Registry
```

Every stage is a durable Inngest function that survives crashes and restarts. Failed stages report exactly what to fix.

---

## Pipeline Stages

| # | Stage | What it does | Threshold |
|---|-------|-------------|-----------|
| 1 | Similarity & Diversity | Embedding + cosine comparison against approved tasks | cosine > 0.85 → rejected |
| 2 | CI Checks | Bash syntax, Python compilation, Docker build | All green |
| 3 | Quality | LLM-as-judge across 11 criteria (realism, clarity, verifiability) | Average ≥ 0.6 |
| 4 | Preflight | `pytest --collect-only` inside the built image | ≥ 6 test functions |
| 5 | Oracle / NOP | Two containers: NOP (tests alone must fail), Oracle (solve.sh + tests must pass) | NOP=0, Oracle=1 |
| 6 | Easiness | Oracle run ×5; exactly 1/5 must pass | 1/5 |
| 7 | Difficulty | Oracle run ×5; 1–3/5 must pass | 1–3/5 |
| 8 | Agent Quality | LLM-as-judge on instruction realism, no leaked assertions, actionability | ≥ 70% |

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, TypeScript, TailwindCSS, Framer Motion |
| Backend | Python (FastAPI), SQLAlchemy, PostgreSQL |
| Event Pipeline | Inngest (durable functions) |
| Embeddings | Ollama (`nomic-embed-text`) |
| LLM Providers | DeepSeek, Anthropic, OpenRouter, OpenAI |
| Storage | Sia Network via `@siafoundation/sia-storage` SDK |
| Metadata | Sia Indexd |
| Containerization | Docker (sibling containers on host daemon) |
| ORM | Prisma (frontend-owned schema) |

---

## Running It

### With Docker (recommended)

```bash
docker compose up --build
```

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Next.js dashboard |
| Backend | http://localhost:8000 | FastAPI pipeline executor |
| Inngest | http://localhost:8288 | Event-driven pipeline UI |
| PostgreSQL | localhost:5432 | Database |
| Ollama | localhost:11434 | Local embeddings |

When the backend boots it eagerly initialises the Sia client. If Sia is unreachable or unapproved, it gracefully falls into **demo mode** — uploads and pipeline stages are simulated with realistic delays. The UI is identical either way; the mode badge in the top nav tells you which you're in.

### Without Docker (development)

#### 1. Environment variables

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.local.example frontend/.env.local
```

The defaults work out of the box. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://...` | PostgreSQL connection string |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `OPENAI_API_KEY` | — | For LLM quality checks |
| `DEEPSEEK_API_KEY` | — | DeepSeek provider key |
| `SIA_MODE` | `auto` | `auto` / `live` / `demo` |
| `SIA_INDEXER_URL` | `https://sia.storage` | Sia indexer endpoint |
| `SIA_APP_ID` | `8f70656e62656e63686d61726b...` | 32-byte hex app identity |

#### 2. Start the stack (correct order)

```bash
# Terminal 1 — PostgreSQL
docker run -d --name openbench_pg \
  -e POSTGRES_USER=openbench \
  -e POSTGRES_PASSWORD=openbench_secret \
  -e POSTGRES_DB=openbench \
  -p 5432:5432 \
  postgres:16-alpine

# Terminal 2 — Ollama
docker run -d --name openbench_ollama \
  -p 11434:11434 \
  -v ollama_data:/root/.ollama \
  ollama/ollama:latest

# Pull the embedding model
docker exec openbench_ollama ollama pull nomic-embed-text:latest

# Terminal 3 — Backend (start AFTER Postgres + Ollama are ready)
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The backend eagerly initialises the Sia client on boot. Watch the logs for the approval URL:

```
╔══════════════════════════════════════════════════════════════╗
║               [Sia] ACTION REQUIRED                          ║
║  Open this URL to approve the app:                           ║
║  https://sia.storage/approve?...                             ║
╚══════════════════════════════════════════════════════════════╝
```

If Sia is unreachable or you skip approval, the backend falls into **demo mode** — no action required.

```bash
# Terminal 4 — Inngest (start AFTER backend is running)
npx inngest-cli@latest dev \
  -u http://localhost:8000/api/inngest \
  --no-discovery --no-poll --persist

# Terminal 5 — Frontend (start AFTER backend is ready)
cd frontend && npm install && npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| Inngest | http://localhost:8288 |

### Stopping

- **Docker:** `docker compose down`
- **Manual:** Press `Ctrl+C` in each terminal. Data persists in `backend/data/` (Postgres database, Sia keys).

---

## Connecting a Real Sia Indexer

The Sia SDK requires a one-time approval flow:

1. Set `SIA_APP_ID` in your environment to a real 32-byte hex string (your app's stable identity).
2. Start the stack and watch the backend logs for the approval URL.
3. Open that URL in your browser and approve the connection.
4. The backend derives and stores an App Key in `appkey.hex`. Subsequent boots reuse it automatically.

**Recovery phrase:** On first boot the backend auto-generates a BIP-39 recovery phrase and writes it to `phrase.enc` inside the data directory. In a production app you'd ask the user for their own phrase and never store it. For this demo, automatic generation keeps the setup frictionless.

---

## Authoring a Task

Each task is a ZIP archive with this structure:

```
task-name/
├── instruction.md          # The problem statement (natural language, like explaining to a teammate)
├── task.toml               # Metadata: working_dir, network_required, test_runner
├── environment/
│   └── Dockerfile          # The broken environment the agent must fix
├── solution/
│   └── solve.sh            # The oracle fix — tests must fail before this runs
└── tests/
    ├── test.sh             # Test harness entrypoint
    ├── test_*.py           # Python test functions (or JS/Hardhat equivalents)
    └── ...
```

**Contract:**
- `test.sh` MUST write a reward to `$REWARD_FILE` (injected as `/logs/verifier/reward.txt`)
  - NOP run (no solution): must write `0`
  - Oracle run (after `solve.sh`): must write `1`
- At least 6 test functions required (Python `def test_*` or JS `it(...)`/`test(...)`)
- No self-reporting — the verifier writes the result

---

## Running a Benchmark

1. Approved tasks are indexed via Sia Indexd — reproducible and forkable by anyone.
2. Configure a model provider (DeepSeek, Anthropic, OpenRouter, etc.) in the dashboard.
3. Start a benchmark run — the agent gets an isolated Docker container with the broken environment.
4. After execution, the verifier checks `reward.txt` and the result is uploaded to Sia Network.

---

## Project Layout

```
openbench/
├── docker-compose.yml           # 6-service orchestration
├── Note.txt                     # Dev commands reference
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── main.py              # FastAPI server with lifespan Sia init
│       ├── core/
│       │   ├── config.py        # Pydantic settings (env-based)
│       │   └── database.py      # Async SQLAlchemy session
│       ├── models/
│       │   └── orm.py           # SQLAlchemy ORM models
│       ├── routers/
│       │   ├── approve.py       # Task approval + Sia upload
│       │   ├── pipeline.py      # Pipeline stage endpoints
│       │   ├── runs.py          # Benchmark run reads + log streaming
│       │   ├── sia.py           # Sia connection status
│       │   └── tasks.py         # Task reads (debugging)
│       ├── schemas/
│       │   └── schemas.py       # Pydantic request/response models
│       └── services/
│           ├── agent_prompt.py  # LLM prompt building
│           ├── agent_quality.py # LLM-as-judge for instructions
│           ├── easiness.py      # 5-run prefilter (target: 1/5 passes)
│           ├── llm.py           # Unified LLM provider abstraction
│           ├── pipeline.py      # Docker container execution (6 pipeline stages)
│           ├── quality.py       # 11-criteria quality assessment
│           ├── sia_client.py    # Sia SDK singleton + demo fallback
│           ├── sia.py           # Sia upload orchestration
│           ├── similarity.py    # Embedding-based similarity check
│           └── sse.py           # Server-sent events for live pipeline status
├── frontend/
│   ├── Dockerfile
│   ├── .env.example
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   ├── postcss.config.js
│   └── src/
│       ├── app/
│       │   ├── globals.css      # Global styles
│       │   ├── layout.tsx       # Root layout with NavBar
│       │   ├── page.tsx         # Landing page
│       │   ├── admin/
│       │   │   └── page.tsx     # Admin dashboard (benchmark cards)
│       │   ├── api/             # Next.js API routes
│       │   │   ├── admin/       # Ready-tasks, stats
│       │   │   ├── health/      # Health check
│       │   │   ├── inngest/     # Inngest handler
│       │   │   ├── models/      # Model provider config
│       │   │   ├── projects/    # Project CRUD + task management
│       │   │   │   └── [id]/tasks/[taskId]/
│       │   │   │       ├── approve/
│       │   │   │       ├── reject/
│       │   │   │       ├── revert/
│       │   │   │       └── runs/
│       │   │   ├── runs/        # Benchmark run state
│       │   │   ├── sia/status/  # Sia connection status
│       │   │   └── tasks/       # Task CRUD
│       │   ├── dashboard/
│       │   │   └── page.tsx     # Main dashboard
│       │   └── projects/
│       │       ├── [id]/
│       │       │   ├── page.tsx        # Project detail
│       │       │   └── submit/page.tsx # Task submission
│       │       └── new/page.tsx        # Create project
│       ├── components/
│       │   ├── NavBar.tsx
│       │   ├── LogTerminal.tsx
│       │   ├── PipelineStages.tsx
│       │   ├── ScoreDisplay.tsx
│       │   ├── SiaProof.tsx
│       │   ├── StatusBadge.tsx
│       │   ├── TaskActions.tsx
│       │   ├── TaskRow.tsx
│       │   └── admin/
│       │       ├── BenchmarkCards.tsx
│       │       └── SiaPipelineAccordion.tsx
│       └── lib/
│           ├── admin-context.tsx
│           ├── types.ts
│           ├── use-sia-sse.ts           # SSE hook for pipeline status
│           ├── inngest/
│           │   ├── client.ts            # Inngest client
│           │   ├── pipeline-inngest.ts   # 8-stage curation pipeline
│           │   └── sia-pipeline.ts       # Sia upload pipeline
│           └── prisma/
│               ├── client.ts
│               ├── index.ts
│               ├── schema.prisma
│               └── migrations/
```

---

## Architecture Notes

### Container Strategy

The backend runs inside Docker. To spin up task containers it uses the host Docker socket mounted at `/var/run/docker.sock`. Containers are launched as **siblings** on the host daemon (not children), with unique names derived from `taskId + stage` so parallel runs never collide. Containers are always removed after the stage completes.

### Pipeline Stage Contract

Each pipeline function receives `(taskId, storagePath)` and returns `(passed: bool, message: str)`. Stages are called by the Inngest function via HTTP POST to the backend's `/api/pipeline/{stage}` endpoints. Logs are written to `PipelineLog` in the database.

### Sia Integration

- **Approval flow:** One-time browser approval via Sia Indexer URL → derived App Key stored in `appkey.hex` → automatic reconnection on restarts.
- **Demo mode:** If Sia is unreachable, the SDK gracefully falls back to simulated uploads with fake object IDs.
- **Results:** Every benchmark result artifact is uploaded to Sia Network — immutable, content-addressed, publicly verifiable.

### File Upload Flow

1. User uploads a task ZIP via the frontend dashboard.
2. Frontend writes the ZIP to a shared `task_uploads` Docker volume.
3. An Inngest event (`pipeline/task.submitted`) triggers the 8-stage curation pipeline.
4. Each stage calls the backend API, which reads the ZIP from the shared volume.
5. After all 8 stages pass, a human reviews and approves the task for the registry.

---

*Built in the open. Tasks are reproducible, shareable, and forkable — anyone can run the same benchmark and verify the result.*