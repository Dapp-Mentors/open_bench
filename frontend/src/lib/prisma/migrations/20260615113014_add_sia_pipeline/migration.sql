-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "siaStatus" TEXT NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "SiaLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "passed" BOOLEAN,
    "message" TEXT NOT NULL DEFAULT '',
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiaLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiaLog_taskId_idx" ON "SiaLog"("taskId");

-- AddForeignKey
ALTER TABLE "SiaLog" ADD CONSTRAINT "SiaLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
