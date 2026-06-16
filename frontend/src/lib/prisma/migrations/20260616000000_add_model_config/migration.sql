-- CreateTable
CREATE TABLE "ModelConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelConfig_key_idx" ON "ModelConfig"("key");