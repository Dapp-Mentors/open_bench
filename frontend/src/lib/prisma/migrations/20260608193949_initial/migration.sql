-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "dockerImage" TEXT NOT NULL DEFAULT '',
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "scoringType" TEXT NOT NULL DEFAULT 'passfail',
    "expectedOutput" TEXT,
    "expectedPattern" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "similarityScore" DOUBLE PRECISION,
    "isDuplicate" BOOLEAN,
    "ciPassed" BOOLEAN,
    "qualityScore" DOUBLE PRECISION,
    "qualityDetails" TEXT,
    "easinessResult" TEXT,
    "agentQualityNote" TEXT,
    "siaHash" TEXT,
    "indexdKey" TEXT,
    "embeddingJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "passed" BOOLEAN,
    "message" TEXT NOT NULL DEFAULT '',
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "score" DOUBLE PRECISION,
    "runtimeMs" INTEGER,
    "tokenUsage" INTEGER,
    "siaHash" TEXT,
    "indexdKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineLog_taskId_idx" ON "PipelineLog"("taskId");

-- CreateIndex
CREATE INDEX "BenchmarkRun_taskId_idx" ON "BenchmarkRun"("taskId");

-- CreateIndex
CREATE INDEX "BenchmarkRun_projectId_idx" ON "BenchmarkRun"("projectId");

-- CreateIndex
CREATE INDEX "RunLog_runId_idx" ON "RunLog"("runId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineLog" ADD CONSTRAINT "PipelineLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkRun" ADD CONSTRAINT "BenchmarkRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunLog" ADD CONSTRAINT "RunLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BenchmarkRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
