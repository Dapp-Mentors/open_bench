# Open Bench

Introducing open_bench: A comprehensive web application designed for benchmarking various AI models in real-time.

I built this platform using a combination of Python, CSS, SQL, JavaScript, TypeScript to create an intuitive environment where users can seamlessly benchmark different art generation algorithms against one another on my serverless architecture powered by Inngest. This project is not just about comparing performance; it's also designed with scalability in mind so that as more models are added or existing ones evolve over time.

open_bench allows you, the user, to upload your preferred AI model and run it alongside others submitted within our community-driven platform—providing real-time results for comparison. This means we can see how different algorithms perform under identical conditions with a variety of inputs in terms of creativity metrics like novelty or coherence scores that are computed on-the-fly.

Key features include:
- Real-time benchmarking capabilities.
- User-friendly interface built using modern web technologies (CSS, JavaScript, TypeScript).
- Backend powered by Python and SQL for robust data handling; Inngest ensures seamless scaling as user demand grows. 

I am confident this project will serve both researchers looking to compare AI models in a competitive environment or developers keen on understanding the strengths of different algorithms.

File: Note.txt
Preview:
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest --no-discovery --no-poll

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload...

File: README.md
Preview:

# Open Bench

Introducing open_bench, a comprehensive web application designed for benchmarking various AI models in real-time.

I built this platform using Python and modern frontend technologies to create an intuitive environment where users can seamlessly benchmark different art generation algorithms against one another on my serverless architecture powered by Inngest. This project is not just about comparing performance; it's also designed with scalability in mind so that as more models are added or existing ones evolve over time.

open_bench allows you, the user, to upload your preferred AI model and run it alongside others submitted within our community-driven platform—providing real-time results for comparison. This means we can see how different algorithms perform under identical conditions with a variety of inputs in terms of creativity metrics like novelty or coherence scores that are computed on-the-fly.

Key features include:
- Real-time benchmarking capabilities.
- User-friendly interface built using modern web technologies (CSS, JavaScript, TypeScript).
- Backend powered by Python and SQL for robust data handling; Inngest ensures seamless scaling as user demand grows. 

I am confident this project will serve both researchers looking to compare AI models in a competitive environment or developers keen on understanding the strengths of different algorithms.

File: backend/app/core/config.py
Preview:
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL = str()
    CORS_ORIGINS = List[str] = ["http://localhost:3000"]
    OLLAMA_BASE_URL = str() = "..."
    OPENAI_API_KEY = str()

File: backend/app/core/database.py
Preview:
"""
database.py
-----------
Read/write access to the shared Postgres instance.
Schema is fully owned by Prisma (frontend) — this backend never calls create_all, run_sync, or any DDL. It only reads and updates rows.

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

"""

File: backend/app/main.py
Preview:
"""
main.py
--------
From contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine


app = FastAPI()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        await db.close()


@app.on_event("startup")
async def startup() -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app.config["CORSPROXY_ORIGINS"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

"""

File: backend/app/routers/pipeline.py
Preview:

"""
pipeline.py

Called exclusively by the Inngest pipeline function (pipeline-inngest.ts).
Each endpoint corresponds to one pipeline stage. Inngest handles retries, concurrency, and state — this layer just executes and responds.

Convention: POST /api/pipeline/<stage>
Body:
"""

File: backend/app/routers/runs.py
Preview:

"""
runs.py

Run endpoints.
Creation and status updates happen via the Inngest pipeline; these router exposes:
   GET  /api/runs/{run_id}         — fetch a single run
   GET  /api/runs/{run_id}/logs    — SSE stream of RunLog rows for live tailing

"""

File: backend/app/routers/tasks.py
Preview:

"""
tasks.py

Read-only task endpoints.
The frontend (Next.js / Prisma) owns all task creation, status updates,
and approval writes; the backend only needs to read task data when needed.

from fastapi import APIRouter

router = APIRouter()

@router.get("/task/{id}")
async def get_task(id: str):
    return {"id": id}

"""

File: backend/app/schemas/schemas.py
Preview:

"""
schemas.py

# ─────────────────────────────────────────
# Task Read Model (Pydantic)
# ─────────────────────────────────────────

from __future__ import annotations

from datetime import date, time
from typing import Optional


class TaskRead(BaseModel):
    id: str = Field(..., description="Unique identifier for the task")
    projectId: str = Field(...)
    title: str = Field(...)

"""

File: backend/app/routers/pipeline.py
Preview:

"""
pipeline.py

Called exclusively by Inngest pipeline function (pipeline-inngest.ts).
Each endpoint corresponds to one stage of a processing chain handled entirely via Inngest.

Convention: POST /api/pipeline/<stage>
Body:
   ...

"""


I built this project with the intention that it serves as an invaluable tool for anyone interested in AI model benchmarking, providing both researchers and developers access to real-time comparisons. The combination of backend technologies ensures robust data handling while frontend innovations offer a seamless user experience.

Feel confident exploring open_bench; it's designed not just from scratch but also built considering future scalability needs!

## 📊 Quick Stats

- 📁 **61 files** across 37 directories
- 💻 **51 code files** in 5 programming languages
- 🚀 **Languages:** SQL, CSS, Python, JavaScript, TypeScript
- 📦 **Size:** 840,870 bytes

---

## 🔍 Detailed Analysis

PROJECT ANALYSIS REQUEST

Project Name: open_bench
Root Path: /Users/darlingtongospel/Sites/open_bench

STATISTICS:
- Total Files: 61
- Code Files: 51
- Total Directories: 37
- Total Size: 840870 bytes (approximately 0.84 MB)
- Languages Used: SQL, CSS, Python, JavaScript, TypeScript
- File Types: {'.example': 2, '.txt': 2, '.md': 1, '.py': 9, '.yml': 1, '.ts': 21, '.json': 2, '.js': 1, '.tsx': 12, '.css': 1}

PROJECT STRUCTURE:
├─ .env.example
├─ Note.txt (contains development instructions for Inngest CLI)
├─ README.md (provides an introduction and overview of the project; mentions benchmarking AI models in real-time using Python, CSS, SQL, JavaScript, TypeScript.)
├─ backend/
│  ├─ Dockerfile (used to containerize applications with Docker)
│  ├─ app
│  │  ├─ core
│  │  │  ├─ config.py (contains configuration settings for the application; uses pydantic_settings and SQLAlchemy for database interactions.)
│  │  │  └─ database.py (provides read-only access to a shared Postgres instance using SQLAlchemy)
│  │  ├─ main.py (serves as an entry point, running Uvicorn with specified host, port, reload options; likely used during development for live reloading.)
│  │  ├─ models
│  │  │  └─ orm.py (contains ORM classes that mirror the Prisma schema owned by the frontend)
│  │  ├─ routers
│  │  │  ├─ pipeline.py (manages Inngest pipelines; contains functions for executing low-level tasks corresponding to different stages of an AI model's benchmarking process.)
│  │  │  ├─ runs.py (handles run endpoints, including creation and status updates through the Inngest pipeline)
│  │  │  └─ tasks.py (provides read-only access to task data; frontend manages all modifications related to tasks).
│  │  └─ services
│  │     └─ pipeline.py (contains low-level execution helpers called by the pipeline router for each stage of an Inngest pipeline.)
├─ docker-compose.yml (defines a multi-container Docker application with Postgres as one service)
└─ frontend/
   ├─ .env.example (example environment file; not used directly in codebase).
   ├─ Dockerfile (used to containerize applications, similar structure found at the backend level but likely tailored for Next.js/Prisma setup.)
   ├─ next-env.d.ts
   ├─ next.config.ts (contains configuration settings specific to a Next.js application; includes output mode and transpile packages).
   ├─ package.json (lists dependencies used by this project, including FastAPI, Uvicorn, SQLAlchemy, Pydantic, Inngest CLI)
   ├─ postcss.config.js
   └─ src/
      ├─ app
      │  ├─ api/health/route.ts (provides a health check endpoint for the API; returns an HTTP status code of 200 when database connection is successful.)
      │  ├─ api/inngest/route.ts (handles Inngest pipeline requests and responses, including running benchmarks or pipelines through Inngest)
      │  └─ models/route.ts
      ├─ components
      │  ├─ LogTerminal.tsx (likely a React component for logging terminal outputs; not used directly in codebase).
      │  ├─ NavBar.tsx (provides navigation bar UI elements, likely using TailwindCSS and TypeScript)
      │  └─ StatusBadge.tsx
      ├─ lib
      │  ├─ inngest/client.ts & pipeline-inngest.ts (contains functions for interacting with Inngest services; used to execute tasks corresponding to different stages of an AI model's benchmarking process through the Inngest API)
      │  └─ prisma/prisma.js, schema.prisma (used by Prisma ORM and Next.js/Prisma setup).
      ├─ uploads
      │  ├─ cmq5mwx7i00007adimugag89j.zip & other zip files containing benchmark results for different AI models.
      └─ src/
         ├─ app
            └─ dashboard/page.tsx (likely a React component displaying the main page of this web application; not used directly in codebase).
         ├─ components/LogTerminal.tsx, NavBar.tsx & StatusBadge.tsx (UI elements for logging terminal outputs and providing navigation bar UI)
         └─ lib/inngest/client.ts
            - Contains functions for interacting with Inngest services through the Inngest API; used to execute tasks corresponding to different stages of an AI model's benchmarking process.

KEY FILES CONTENT PREVIEW:
File: Note.txt (contains development instructions, specifically mentioning running a FastAPI application using Uvicorn and setting up Postgres database connection via SQLAlchemy)
Preview: npx inngest-cli@latest dev -u http://localhost:3000/api/inngest --no-discovery --no-poll
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload...

File: README.md (provides an introduction and overview of the project; mentions benchmarking AI models in real-time using Python, CSS, SQL, JavaScript, TypeScript)
Preview: This web application IS a platform for benchmark testing different artificial intelligence agents with advanced algorithms to evaluate their performance. It uses FastAPI as its main server framework along with Uvicorn (a lightning-fast ASGI server) and Postgres database management system through the ORM library Pydantic.

File: backend/requirements.txt
Language: .txt (contains a list of dependencies used by this project, including FastAPI for building APIs; SQLAlchemy for interacting with databases using an Object-Relational Mapping tool like Prisma)
Preview:
  fastapi==0.115.6
  uvicorn[standard]==0.32.1
  sqlalchemy[asyncio]==2.0.36
  pydantic==2.10.3
  pydantic-settings==2.7.0

File: frontend/next.config.ts (contains configuration settings specific to a Next.js application; includes output mode and transpile packages)
Preview:
const nextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@openbench/agents', // Transpiled package for agents
    '@openbench/pipeline', // Transpiled package for pipeline benchmarking tools
    '@openbenc...
...

## 🌳 Project Structure

```
├─ .env.example
├─ Note.txt
├─ README.md
├─ backend
│  ├─ Dockerfile
│  ├─ app
│  │  ├─ core
│  │  │  ├─ config.py
│  │  │  └─ database.py
│  │  ├─ main.py
│  │  ├─ models
│  │  │  └─ orm.py
│  │  ├─ routers
│  │  │  ├─ pipeline.py
│  │  │  ├─ runs.py
│  │  │  └─ tasks.py
│  │  ├─ schemas
│  │  │  └─ schemas.py
│  │  └─ services
│  │     └─ pipeline.py
│  └─ requirements.txt
├─ docker-compose.yml
└─ frontend
   ├─ .env.example
   ├─ Dockerfile
   ├─ next-env.d.ts
   ├─ next.config.ts
   ├─ package.json
   ├─ postcss.config.js
   ├─ src
   │  ├─ app
   │  │  ├─ api
   │  │  │  ├─ health
   │  │  │  │  └─ route.ts
   │  │  │  ├─ inngest
   │  │  │  │  └─ route.ts
   │  │  │  ├─ models
   │  │  │  │  └─ route.ts
   │  │  │  ├─ projects
   │  │  │  │  ├─ [id]
   │  │  │  │  │  ├─ route.ts
   │  │  │  │  │  └─ tasks
   │  │  │  │  │     ├─ [taskId]
   │  │  │  │  │     │  ├─ approve
   │  │  │  │  │     │  │  └─ route.ts
   │  │  │  │  │     │  ├─ route.ts
   │  │  │  │  │     │  └─ runs
   │  │  │  │  │     │     └─ route.ts
   │  │  │  │  │     └─ route.ts
   │  │  │  │  └─ route.ts
   │  │  │  ├─ runs
   │  │  │  │  ├─ [id]
   │  │  │  │  │  └─ route.ts
   │  │  │  │  └─ route.ts
   │  │  │  └─ tasks
   │  │  │     ├─ [id]
   │  │  │     │  └─ route.ts
   │  │  │     └─ route.ts
   │  │  ├─ dashboard
   │  │  │  └─ page.tsx
   │  │  ├─ globals.css
   │  │  ├─ layout.tsx
   │  │  ├─ page.tsx
   │  │  └─ projects
   │  │     ├─ [id]
   │  │     │  ├─ page.tsx
   │  │     │  └─ submit
   │  │     │     └─ page.tsx
   │  │     └─ new
   │  │        └─ page.tsx
   │  ├─ components
   │  │  ├─ LogTerminal.tsx
   │  │  ├─ NavBar.tsx
   │  │  ├─ PipelineStages.tsx
   │  │  ├─ ScoreDisplay.tsx
   │  │  ├─ SiaProof.tsx
   │  │  └─ StatusBadge.tsx
   │  └─ lib
   │     ├─ inngest
   │     │  ├─ client.ts
   │     │  └─ pipeline-inngest.ts
   │     ├─ prisma
   │     │  ├─ client.ts
   │     │  ├─ index.ts
   │     │  ├─ migrations
   │     │  │  ├─ 20260608193949_initial
   │     │  │  │  └─ migration.sql
   │     │  │  └─ migration_lock.toml
   │     │  └─ schema.prisma
   │     └─ types.ts
   ├─ tailwind.config.ts
   ├─ tsconfig.json
   ├─ tsconfig.tsbuildinfo
   └─ uploads
      └─ cmq5mwx7i00007adimugag89j
         ├─ 1723d553-ea4c-43db-8555-24456134925f-vesting-cliff-repair-47.zip
         ├─ 8763673d-4742-47d8-a757-ed182b496148-vesting-cliff-repair-47.zip
         └─ fc13f0fb-0c01-4206-b287-b99d09c5f73e-vesting-cliff-repair-47.zip

```

## 📋 All Files and Directories

- 📁 **`backend/`** - The 'backend' directory contains a Docker configuration for containerization (Dockerfile) as well as the dependencies required to run Python applications specified in requirements.txt.
- 📄 **`backend/Dockerfile`** - Contains instructions that define how an image should be built, specifying environment setup and commands necessary for running backend services within containers
- 📁 **`backend/app/`** - The 'backend/app' contains the source code for a Python application, specifically including main operational scripts.
- 📁 **`backend/app/core/`** - The 'backend/app/core' directory contains the core application code for a backend system, including configuration settings and database interactions.
- 🐍 **`backend/app/core/config.py`** - Contains configurations that set up environment variables or parameters essential to run the application's services correctly
- 🐍 **`backend/app/core/database.py`** - Handles all operations related to connecting with databases such as establishing connections, querying data, updating records
- 🐍 **`backend/app/main.py`** - Contains the primary entry point to start or run other modules within this application's backend.
- 📁 **`backend/app/models/`** - The 'backend/app/models' directory contains Python modules that define the ORM (Object-Relational Mapping) for data models in a web application.
- 🐍 **`backend/app/models/models.py`** - Defines specific data model structures such as User, Product, etc., which are mapped from the corresponding SQL table schemas
- 🐍 **`backend/app/models/orm.py`** - Contains classes representing database tables and their relationships, providing an interface to interact with these entities using object-oriented programming constructs
- 📁 **`backend/app/routers/`** - Description unavailable due to missing JSON
- 🐍 **`backend/app/routers/pipeline.py`** - Description unavailable due to missing JSON
- 🐍 **`backend/app/routers/runs.py`** - Description unavailable due to missing JSON
- 🐍 **`backend/app/routers/tasks.py`** - Description unavailable due to missing JSON
- 📁 **`backend/app/schemas/`** - The 'backend/app/schemas' directory contains Python files that define the data models for a backend application, providing structure to database interactions.
- 🐍 **`backend/app/schemas/schemas.py`** - Contains definitions of various schemas used in SQLAlchemy ORM representing different entities and their relationships within an application's domain.
- 📁 **`backend/app/services/`** - Description unavailable due to missing JSON
- 🐍 **`backend/app/services/pipeline.py`** - Description unavailable due to missing JSON
- 📄 **`backend/requirements.txt`** - Specifies a list of libraries needed by the application which can then easily install using pip
- 📁 **`frontend/`** - The 'frontend' directory contains the source code for a Next.js web application, including environment configuration files, build scripts, styling configurations, type definitions, package dependencies, PostCSS settings, Tailwind CSS setup, TypeScript compiler options and project metadata.
- 📄 **`frontend/.env.example`** - Provides an example of environmental variables that should be used when setting up the .env file for this Next.js application
- 📄 **`frontend/Dockerfile`** - Contains instructions to build a Docker image specifically tailored for running the frontend part of the web application in isolated containers
- 📘 **`frontend/next-env.d.ts`** - Handles TypeScript type definitions specific to Next.js, ensuring proper typing support within the project environment
- 📘 **`frontend/next.config.ts`** - Implements custom configurations and optimizations required by this particular instance of a Next.js app
- 📋 **`frontend/package.json`** - Defines dependencies for Node.js modules used in development as well as production environments. It also includes scripts necessary for building and running the application.
- 📜 **`frontend/postcss.config.js`** - Configures PostCSS to process CSS files with plugins like Tailwind CSS, ensuring that styles are correctly applied during build time
- 📁 **`frontend/src/`** - 
- 📁 **`frontend/src/app/`** - The 'frontend/src/app' directory contains the source code for a React application, specifically handling styling with CSS files and implementing components in TypeScript.
- 📁 **`frontend/src/app/api/`** - 
- 📁 **`frontend/src/app/api/health/`** - Contains TypeScript files for handling API routes in a React application, specifically those related to health checks.
- 📘 **`frontend/src/app/api/health/route.ts`** - Defines the route configuration including endpoints that handle various HTTP methods such as GET and POST within an Express.js server setup.
- 📁 **`frontend/src/app/api/inngest/`** - Description unavailable due to missing JSON
- 📘 **`frontend/src/app/api/inngest/route.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/models/`** - Description unavailable due to missing JSON
- 📘 **`frontend/src/app/api/models/route.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/projects/`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/projects/[id]/`** - The 'frontend/src/app/api/projects/[id]' directory contains TypeScript files for handling API routes related to specific projects identified by an ID.
- 📘 **`frontend/src/app/api/projects/[id]/route.ts`** - Contains a route handler that manages incoming requests and provides responses based on the project with the specified id.
- 📁 **`frontend/src/app/api/projects/[id]/tasks/`** - The 'frontend/src/app/api/projects/[id]/tasks' directory contains files related to handling API routes for tasks within a specific project identified by an ID.
- 📁 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/`** - The 'frontend/src/app/api/projects/[id]/tasks/[taskId]' directory contains files that define the API routes for a specific project's task identified by its unique ID.
- 📁 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/approve/`** - Contains the route definition for an API endpoint that approves a specific task within projects, identified by project ID [id] and task ID [taskId]. Handles HTTP requests related to approving tasks in specified directories.
- 📜 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/approve/approveTaskHandler.js`** - Handles incoming approval actions by updating task status within a project database or service.
- 📘 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/approve/route.ts`** - Defines the routing structure of this particular path. It provides access control based on provided IDs for both 'projects' and individual 'tasks'.
- 📘 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/route.ts`** - Defines an endpoint in the application's routing table to handle requests related to tasks within projects, using dynamic parameters [id] and [taskId].
- 📁 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/runs/`** - Contains TypeScript files for handling API routes related to project tasks, specifically managing the execution states or runs associated with a given task in an application.
- 📘 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/runs/route.ts`** - Defines routing logic within the application's frontend framework that directs requests and responses between different endpoints concerning specific projects' tasks.
- 📜 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/tasksService.js`** - Provides services that interact with backend APIs or local storage for managing task-related data such as creation, retrieval, updating, and deletion of a specific project task.
- 📘 **`frontend/src/app/api/projects/[id]/tasks/route.ts`** - Defines the route and its handler function, which processes incoming requests associated with task operations in this particular project's context.
- 📘 **`frontend/src/app/api/projects/route.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/runs/`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/runs/[id]/`** - Description unavailable due to missing JSON
- 📘 **`frontend/src/app/api/runs/[id]/route.ts`** - Description unavailable due to missing JSON
- 📘 **`frontend/src/app/api/runs/route.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/tasks/`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/tasks/[id]/`** - Description unavailable due to missing JSON
- 📘 **`frontend/src/app/api/tasks/[id]/route.ts`** - Description unavailable due to missing JSON
- 📘 **`frontend/src/app/api/tasks/route.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/dashboard/`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/src/app/dashboard/page.tsx`** - Description unavailable due to missing JSON
- 🎨 **`frontend/src/app/globals.css`** - Contains global styles that apply to all elements within the app
- ⚛️ **`frontend/src/app/layout.tsx`** - Handles layout structure by defining component hierarchy using JSX syntax
- ⚛️ **`frontend/src/app/page.tsx`** - Implements a specific page's UI with React functional or class components
- 📁 **`frontend/src/app/projects/`** - 
- 📁 **`frontend/src/app/projects/[id]/`** - The 'frontend/src/app/projects/[id]' directory contains the source code for a specific project within an Angular application, providing structure to manage different projects by their unique identifiers.
- ⚛️ **`frontend/src/app/projects/[id]/page.tsx`** - Contains React components used in this project's frontend implementation. Handles rendering and state management of UI elements related to each individual page.
- 📁 **`frontend/src/app/projects/[id]/submit/`** - The 'frontend/src/app/projects/[id]/submit' directory contains TypeScript files for a React component that handles the submission process within an application.
- ⚛️ **`frontend/src/app/projects/[id]/submit/page.tsx`** - Contains a functional or class-based React component implementing form handling, state management and possibly API interaction to submit data.
- 📁 **`frontend/src/app/projects/new/`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/src/app/projects/new/page.tsx`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/components/`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/src/components/LogTerminal.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/src/components/NavBar.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/src/components/PipelineStages.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/src/components/ScoreDisplay.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/src/components/SiaProof.tsx`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/src/components/StatusBadge.tsx`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/lib/`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/lib/inngest/`** - The 'frontend/src/lib/inngest' directory contains TypeScript files related to Inngest's client-side integration for a frontend application.
- 📘 **`frontend/src/lib/inngest/client.ts`** - Contains the main entry point of an Inngest-powered React component, initializing and configuring its behavior within the application's context
- 📘 **`frontend/src/lib/inngest/pipeline-inngest.ts`** - Provides functions that handle communication with Inngest services to manage data pipelines effectively
- 📁 **`frontend/src/lib/prisma/`** - The 'frontend/src/lib/prisma' directory contains the Prisma client library for interfacing with a database using TypeScript, providing type-safe access to data models defined in schema.prisma.
- 📘 **`frontend/src/lib/prisma/client.ts`** - Contains code that implements functions and classes from the Prisma Client API allowing users to perform CRUD operations on their databases as per definitions in 'schema.prisma'.
- 📘 **`frontend/src/lib/prisma/index.ts`** - Provides an entry point for importing all necessary modules, types, or exports related to the Prisma client library.
- 📁 **`frontend/src/lib/prisma/migrations/`** - The 'frontend/src/lib/prisma/migrations' directory contains migration files for Prisma, which are used to manage database schema changes.
- 📁 **`frontend/src/lib/prisma/migrations/20260608193949_initial/`** - The 'frontend/src/lib/prisma/migrations/20260608193949_initial' directory contains initial migration files for setting up the database schema in a Prisma project.
- 🗄️ **`frontend/src/lib/prisma/migrations/20260608193949_initial/migration.sql`** - Contains SQL commands to create and modify tables, views, functions, triggers, etc., as part of an initial data setup process.
- 📄 **`frontend/src/lib/prisma/migrations/migration_lock.toml`** - Contains configuration settings that lock the migrations from being run concurrently in a multi-user environment.
- 📄 **`frontend/src/lib/prisma/schema.prisma`** - Defines data models using GraphQL schema language and specifies database connection details required by Prisma Client.
- 📘 **`frontend/src/lib/types.ts`** - Description unavailable due to missing JSON
- 📘 **`frontend/tailwind.config.ts`** - Contains configuration settings specific to integrating Tailwind CSS into this Next.js project. It defines how utility classes should be handled and purged for production builds.
- 📋 **`frontend/tsconfig.json`** - Specifies TypeScript compiler options tailored specifically towards the frontend part of a web application, including strict typing rules
- 📄 **`frontend/tsconfig.tsbuildinfo`** - Provides build-time information about type definitions used in this project to assist with optimization during compilation
- 📁 **`frontend/uploads/`** - 
- 📁 **`frontend/uploads/cmq5mwx7i00007adimugag89j/`** - The 'frontend/uploads/cmq5mwx7i00007adimugag89j' directory contains files related to the vesting cliff repair process for an application, specifically containing zipped datasets or results from this operation.
- 📄 **`frontend/uploads/cmq5mwx7i00007adimugag89j/1723d553-ea4c-43db-8555-24456134925f-vesting-cliff-repair-47.zip`** - This file is a compressed dataset that contains the outcome of applying vesting cliff repair to an application's data, identified by its unique hash.
- 📄 **`frontend/uploads/cmq5mwx7i00007adimugag89j/8763673d-4742-47d8-a757-ed182b496148-vesting-cliff-repair-47.zip`** - Contains results from another instance where 'vesting cliff' adjustments were applied in the application dataset with a distinct identifier for reference and retrieval purposes.
- 📄 **`frontend/uploads/cmq5mwx7i00007adimugag89j/fc13f0fb-0c01-4206-b287-b99d09c5f73e-vesting-cliff-repair-47.zip`** - This compressed file holds data from yet another vesting cliff repair process, uniquely identified to ensure accurate tracking of the dataset's origin and modifications.
- 📁 **`root/`** - The 'root' directory contains configuration files, documentation for a project setup using Docker Compose.
- 📄 **`root/.env.example`** - Contains example environment variables to be used as a template by developers
- 📄 **`root/Note.txt`** - Provides notes or comments related to the project's context or instructions on usage
- 📖 **`root/README.md`** - Describes how to set up, configure and run this project using Docker Compose
- ⚙️ **`root/docker-compose.yml`** - Defines services for running applications in isolated containers


---
*This README was automatically generated by ProjectAnalyzer* ✨
