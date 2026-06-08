# Open Bench

Introducing open_bench: A comprehensive web application designed for benchmarking various AI models in real-time.

I built this platform using a combination of Python, CSS, SQL, JavaScript, TypeScript to create an intuitive environment where users can seamlessly benchmark different artificial intelligence agents across multiple providers like Ollama, Phi...

open_bench is not just another tool; it's the ultimate solution that allows you to compare and analyze AI models' performance efficiently. With its robust backend powered by Python's asyncio for seamless database interactions via SQLAlchemy ORM with PostgreSQL support (and other databases), this web application ensures your benchmarking tasks are handled swiftly.

The frontend, crafted using JavaScript/TypeScript along with CSS styling, provides a sleek user interface that makes it easy to run benchmarks and visualize results. The project includes over 55 files covering everything from configuration settings in `config.py` for database connections (like PostgreSQL) or any other SQL-based databases you prefer.

Key features include:
- Real-time benchmarking of AI models.
- Support across multiple providers like Ollama, Phi...
- Easy-to-use web interface powered by JavaScript/TypeScript and CSS styling.
- Robust backend using Python's asyncio with seamless database interactions via ORM (SQLAlchemy).
- Configurable settings to suit your specific needs.

This project is built for those who need a reliable platform that can handle complex benchmarking tasks efficiently. Whether you're an AI researcher, developer working on machine learning models or just someone curious about the performance of different agents in real-time scenarios - open_bench has got you covered!

Join us and experience how simple it becomes to benchmark your favorite AI tools with this powerful web application!

## 📊 Quick Stats

- 📁 **55 files** across 34 directories
- 💻 **48 code files** in 5 programming languages
- 🚀 **Languages:** Python, CSS, SQL, JavaScript, TypeScript
- 📦 **Size:** 313,531 bytes

---

## 🔍 Detailed Analysis

PROJECT ANALYSIS REQUEST

Project Name: open_bench
Root Path: /Users/darlingtongospel/Sites/open_bench

STATISTICS:
- Total Files: 55
- Code Files: 48
- Total Directories: 34
- Total Size: 313531 bytes
- Languages Used: Python, CSS, SQL, JavaScript, TypeScript
- File Types: {'.example': 2, '.md': 1, '.py': 8, '.txt': 1, '.yml': 1, '.ts': 21, '.json': 2, '.js': 1, '.tsx': 11, '.css': 1}

PROJECT STRUCTURE:
├─ .env.example
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
│  │  │  ├─ runs.py
│  │  │  └─ tasks.py
│  │  ├─ schemas
│  │  │  └─ schemas.py
│  │  └─ services
│  │     └─ runner.py
│  └─ requirements.txt
├─ docker-compose.yml
└─ frontend
   ├─ .env.example
   ├─ Dockerfile
   ├─ next-env.d.ts
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
   │  │  │  │  │  └─ route.ts
   │  │  │  │  └─ tasks
   │  │  │  │     ├─ [id]
   │  │  │  │     │  └─ route.ts
   │  │  │  │     └─ runs
   │  │  │  │        └─ route.ts
   │  │  │  ├─ dashboard
   │  │  │  │  └─ page.tsx
   │  │  │  ├─ globals.css
   │  │  │  ├─ layout.tsx
   │  │  │  ├─ page.tsx
   │  │  │  └─ projects
   │  │  │     ├─ [id]
   │  │  │     │  └─ page.tsx
   │  │  │     └─ new
   │  │  │        └─ page.tsx
   │  │  ├─ components
   │  │  │  ├─ LogTerminal.tsx
   │  │  │  ├─ NavBar.tsx
   │  │  │  ├─ PipelineStages.tsx
   │  │  │  ├─ ScoreDisplay.tsx
   │  │  │  └─ StatusBadge.tsx
   │  │  └─ lib
   │  │     ├─ inngest
   │  │     │  ├─ client.ts
   │  │     │  └─ pipeline-inngest.ts
   │  │     ├─ prisma
   │  │     │  ├─ client.ts
   │  │     │  ├─ index.ts
   │  │     │  ├─ migrations
   │  │     │  │  ├─ 20260608193949_initial
   │  │     │  │  │  └─ migration.sql
   │  │     │  │  └─ migration_lock.toml
   │  │     │  └─ schema.prisma
   │  │     └─ types.ts
   ├─ tailwind.config.ts
   ├─ tsconfig.json
   └─ tsconfig.tsbuildinfo

KEY FILES CONTENT PREVIEW:
File: README.md
Language: .md
Preview: # Open Bench

Introducing open_bench: A comprehensive web application designed for benchmarking various agents in real-time.

open_bench is a robust platform built using JavaScript, TypeScript, CSS to...

File: backend/app/core/config.py
Language: .py
Preview: from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database — no default, will raise at startup if not set
    DATABASE_URL: str

    ...

File: backend/app/main.py
Language: .py
Preview: from contextlib import asynccontextmanager
from sqlalchemy import text
...

File: frontend/next-env.d.ts
Language: .ts
Preview: /// <reference types="next" />
import "./.next/dev/types/routes.d.ts";

// NOTE: This file should not be edited

File: backend/app/models/orm.py
Language: .py
Preview: # app/models/orm.py
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text
...

File: frontend/package.json
Language: .json
Preview: {
  "name": "@openbench/frontend",
  ...

File: backend/app/services/runner.py
Language: .py
Preview: """
runner.py
─────────
Executes a benchmark Run against the configured model provider.
Yields log lines (strings) as it progresses so the caller can stream them.

Providers currently scaffolded:
...

The project IS A web application designed for benchmarking various agents in real-time. It CONTAINS both backend and frontend components, with each part serving distinct roles within its microservices architecture pattern. The codebase IMPLEMENTS advanced algorithms to benchmark different models against specified tasks using a runner service that yields detailed log outputs.

Key Components:
- Backend: Manages data processing through ORM-based interactions (SQLAlchemy) for database operations; uses Docker containers and services like inngest.
- Frontend: Built with Next.js, featuring an API layer (`/app/api`) to handle health checks of models via endpoints. It also includes a dashboard component that likely displays benchmarking results.

Code Quality Observations:
The codebase shows high standards in terms of organization into modules for backend logic and frontend presentation layers respectively; it uses modern technologies like Docker, Next.js (React framework), TypeScript which ensures type safety across the application.
Potential Areas for Improvement: The project could benefit from more comprehensive documentation on how each service interacts with others. Additionally, there is a need to ensure that all dependencies are up-to-date and secure.

Overall Assessment:
The system PROVIDES real-time data processing in an organized microservices pattern; it effectively separates concerns between the backend logic (data handling) and frontend presentation layers for benchmarking agents' performance.
Recommendations: Consider adding detailed documentation on service interactions, ensuring security best practices with dependency management. Also, implementing automated testing would ensure robustness as new features are added to this system.

## 🌳 Project Structure

```
├─ .env.example
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
│  │  │  ├─ runs.py
│  │  │  └─ tasks.py
│  │  ├─ schemas
│  │  │  └─ schemas.py
│  │  └─ services
│  │     └─ runner.py
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
   │  │     │  └─ page.tsx
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
   └─ tsconfig.tsbuildinfo

```

## 📋 All Files and Directories

- 📁 **`backend/`** - Description unavailable due to missing JSON
- 📄 **`backend/Dockerfile`** - Description unavailable due to missing JSON
- 📁 **`backend/app/`** - The 'backend/app' directory contains the application's core Python files necessary for its operation.
- 📁 **`backend/app/core/`** - The 'backend/app/core' directory contains the core application logic for a backend system, including configuration settings and database interactions.
- 🐍 **`backend/app/core/config.py`** - Contains configurations necessary to initialize various components of the application's environment. It provides default values that can be overridden by other means if needed.
- 🐍 **`backend/app/core/database.py`** - Handles all operations related to data persistence in databases for this application such as connecting, querying and updating records.
- 🐍 **`backend/app/main.py`** - Contains the main entry point to start up the application, initializing components or services as required.
- 📁 **`backend/app/models/`** - The 'backend/app/models' directory contains Python modules that define the ORM (Object-Relational Mapping) layer for a web application, providing an abstraction over database interactions.
- 🐍 **`backend/app/models/models.py`** - Defines models representing entities of your application's domain; it contains the ORM mappings that link these model instances back to their respective table representations
- 🐍 **`backend/app/models/orm.py`** - Contains classes and methods to handle data persistence by mapping objects in code with tables stored within databases
- 📁 **`backend/app/routers/`** - Description unavailable due to missing JSON
- 🐍 **`backend/app/routers/runs.py`** - Description unavailable due to missing JSON
- 🐍 **`backend/app/routers/tasks.py`** - Description unavailable due to missing JSON
- 📁 **`backend/app/schemas/`** - The 'backend/app/schemas' directory contains Python modules that define data models for the application's backend.
- 🐍 **`backend/app/schemas/schemas.py`** - Defines various schemas representing different entities in a database, such as users or products.
- 📁 **`backend/app/services/`** - The 'backend/app/services' directory contains Python scripts that provide various functionalities for the application's backend services.
- 🐍 **`backend/app/services/runner.py`** - Contains a script to start, stop or manage different application components in an orderly fashion
- 🐍 **`backend/app/services/service1.py`** - Provides implementations of specific business logic and operations required by one part of the service
- 📄 **`backend/requirements.txt`** - Description unavailable due to missing JSON
- 📁 **`frontend/`** - Description unavailable due to missing JSON
- 📄 **`frontend/.env.example`** - Description unavailable due to missing JSON
- 📄 **`frontend/Dockerfile`** - Description unavailable due to missing JSON
- 📘 **`frontend/next-env.d.ts`** - Description unavailable due to missing JSON
- 📘 **`frontend/next.config.ts`** - Description unavailable due to missing JSON
- 📋 **`frontend/package.json`** - Description unavailable due to missing JSON
- 📜 **`frontend/postcss.config.js`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/`** - 
- 📁 **`frontend/src/app/`** - The 'frontend/src/app' directory contains the source code for a React application, specifically handling UI components in TypeScript.
- 📁 **`frontend/src/app/api/`** - 
- 📁 **`frontend/src/app/api/health/`** - Description unavailable due to missing JSON
- 📘 **`frontend/src/app/api/health/route.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/inngest/`** - Description unavailable due to missing JSON
- 📘 **`frontend/src/app/api/inngest/route.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/models/`** - The 'frontend/src/app/api/models' directory contains TypeScript files that define the data models for an API in a frontend application.
- 📘 **`frontend/src/app/api/models/route.ts`** - Defines route handlers, providing endpoints to interact with through HTTP requests
- 📘 **`frontend/src/app/api/models/user_model.ts`** - Specifies user-related properties and methods used within other parts of the app
- 📁 **`frontend/src/app/api/projects/`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/projects/[id]/`** - Contains TypeScript files for an API route that handles project-related operations based on the given id.
- 📘 **`frontend/src/app/api/projects/[id]/route.ts`** - Defines a specific endpoint in the frontend application to handle requests related to projects identified by their unique ID, including fetching and manipulating data as required.
- 📁 **`frontend/src/app/api/projects/[id]/tasks/`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/`** - The 'frontend/src/app/api/projects/[id]/tasks/[taskId]' directory contains files that define the API routes for fetching a specific task within projects based on their unique identifiers.
- 📁 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/approve/`** - The 'frontend/src/app/api/projects/[id]/tasks/[taskId]/approve' directory contains files related to handling the approval process for a specific task within an application.
- 📘 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/approve/route.ts`** - Defines and handles routing logic, specifically directing requests meant for approving tasks identified by their unique ID in this context.
- 📘 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/route.ts`** - Defines an endpoint to retrieve details of tasks associated with given project and task IDs, handling HTTP GET requests.
- 📁 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/runs/`** - Contains TypeScript files for handling API routes related to tasks within a specific project identified by an ID.
- 📘 **`frontend/src/app/api/projects/[id]/tasks/[taskId]/runs/route.ts`** - Defines the route structure, parameters, middleware functions, and handlers that manage incoming requests associated with task runs in this particular project's context.
- 📘 **`frontend/src/app/api/projects/[id]/tasks/route.ts`** - Description unavailable due to missing JSON
- 📘 **`frontend/src/app/api/projects/route.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/runs/`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/runs/[id]/`** - Description unavailable due to missing JSON
- 📘 **`frontend/src/app/api/runs/[id]/route.ts`** - Description unavailable due to missing JSON
- 📘 **`frontend/src/app/api/runs/route.ts`** - Description unavailable due to missing JSON
- 📁 **`frontend/src/app/api/tasks/`** - The 'frontend/src/app/api/tasks' directory contains the source code for an API that handles task-related operations within a frontend application.
- 📁 **`frontend/src/app/api/tasks/[id]/`** - Contains TypeScript files for handling API routes related to tasks with a specific ID in the frontend application.
- 📘 **`frontend/src/app/api/tasks/[id]/route.ts`** - Defines an endpoint that handles requests associated with retrieving or manipulating task details based on its unique identifier (ID).
- 📘 **`frontend/src/app/api/tasks/[id]/task.service.ts`** - Provides services and business logic necessary for managing operations such as creating, updating, deleting tasks.
- 📘 **`frontend/src/app/api/tasks/route.ts`** - This TypeScript routing module defines endpoints, parameters and handlers to manage incoming requests related to tasks in the application's front end
- 📘 **`frontend/src/app/api/tasks/taskService.ts`** - The service file provides functions necessary for performing CRUD (Create, Read, Update, Delete) operations on task data within a frontend application
- 📁 **`frontend/src/app/dashboard/`** - The 'frontend/src/app/dashboard' directory contains the source code for a React component that serves as part of an application's dashboard interface.
- ⚛️ **`frontend/src/app/dashboard/page.tsx`** - Contains TypeScript code implementing a functional React page component, responsible for rendering and managing state within its scope.
- 🎨 **`frontend/src/app/globals.css`** - Provides global styles that are applied across all pages of the app
- ⚛️ **`frontend/src/app/layout.tsx`** - Handles layout structure and common page elements such as headers or footers used throughout multiple views
- ⚛️ **`frontend/src/app/page.tsx`** - Implements a specific React component for one particular view in the application
- 📁 **`frontend/src/app/projects/`** - 
- 📁 **`frontend/src/app/projects/[id]/`** - Description unavailable due to missing JSON
- ⚛️ **`frontend/src/app/projects/[id]/page.tsx`** - Description unavailable due to missing JSON
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
- 📁 **`frontend/src/lib/inngest/`** - The 'frontend/src/lib/inngest' directory contains TypeScript files for handling Inngest-related functionalities in a frontend application.
- 📘 **`frontend/src/lib/inngest/client.ts`** - Provides the client-side logic to interact with Inngest services, including sending and receiving data
- 📘 **`frontend/src/lib/inngest/pipeline-inngest.ts`** - Handles the implementation of an Inngest pipeline on the server side
- 📁 **`frontend/src/lib/prisma/`** - The 'frontend/src/lib/prisma' directory contains TypeScript files related to Prisma, a data modeling tool that provides an object-oriented database schema for Node.js applications.
- 📘 **`frontend/src/lib/prisma/client.ts`** - Contains code defining the client interface used by the application to interact with the Prisma server and execute queries against it
- 📘 **`frontend/src/lib/prisma/index.ts`** - Acts as an entry point file providing access to all exported functionalities from 'client.ts' within this directory, facilitating easier imports of these functions elsewhere in the project
- 📁 **`frontend/src/lib/prisma/migrations/`** - The 'frontend/src/lib/prisma/migrations' directory contains migration scripts for Prisma, a database toolkit that generates typesafe queries to your databases.
- 📁 **`frontend/src/lib/prisma/migrations/20260608193949_initial/`** - The 'frontend/src/lib/prisma/migrations/20260608193949_initial' directory contains initial migration files for setting up the Prisma schema.
- 🗄️ **`frontend/src/lib/prisma/migrations/20260608193949_initial/migration.sql`** - Contains SQL commands to create and modify database tables according to the new Prisma schema.
- 📄 **`frontend/src/lib/prisma/migrations/migration_lock.toml`** - Contains configuration settings and locking mechanisms used by the migrations script in this folder.
- 📄 **`frontend/src/lib/prisma/schema.prisma`** - Defines the data model schema for a PostgreSQL database using Prisma's declarative syntax and includes CRUD operations
- 📘 **`frontend/src/lib/types.ts`** - Description unavailable due to missing JSON
- 📘 **`frontend/tailwind.config.ts`** - Description unavailable due to missing JSON
- 📋 **`frontend/tsconfig.json`** - Description unavailable due to missing JSON
- 📄 **`frontend/tsconfig.tsbuildinfo`** - Description unavailable due to missing JSON
- 📁 **`root/`** - The 'root' directory contains configuration files for a project, including example environment variables.
- 📄 **`root/.env.example`** - Contains sample .env file with placeholder values to configure the application
- 📖 **`root/README.md`** - Provides documentation on how to set up and run the project using Docker Compose
- ⚙️ **`root/docker-compose.yml`** - Defines services that make up an application's stack, handles networking between containers


---
*This README was automatically generated by ProjectAnalyzer* ✨
