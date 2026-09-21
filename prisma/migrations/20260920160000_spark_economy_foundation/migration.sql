-- CreateEnum
CREATE TYPE "SparkTransactionType" AS ENUM ('UPLOAD_REWARD', 'SUBSCRIPTION_GRANT', 'EXTRA_SNAP_UPLOAD', 'CAPTION_EDIT', 'SUBSCRIPTION_EXPIRATION', 'ADMIN_ADJUSTMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "SparkTransactionSource" AS ENUM ('SNAP', 'SUBSCRIPTION', 'ADMIN');

-- CreateEnum
CREATE TYPE "SparkKind" AS ENUM ('EARNED', 'SUBSCRIPTION');

-- CreateTable
CREATE TABLE "spark_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "SparkTransactionType" NOT NULL,
    "source" "SparkTransactionSource" NOT NULL,
    "sparkKind" "SparkKind" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "referenceType" TEXT,
    "referenceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spark_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_upload_counters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_upload_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_spark_earn_counters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_spark_earn_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_usages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapId" TEXT NOT NULL,
    "isFree" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spark_transactions_userId_type_referenceId_key" ON "spark_transactions"("userId", "type", "referenceId");

-- CreateIndex
CREATE INDEX "spark_transactions_userId_expiresAt_idx" ON "spark_transactions"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "spark_transactions_userId_type_createdAt_idx" ON "spark_transactions"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "spark_transactions_userId_createdAt_idx" ON "spark_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "spark_transactions_source_createdAt_idx" ON "spark_transactions"("source", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "daily_spark_earn_counters_userId_day_key" ON "daily_spark_earn_counters"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "daily_upload_counters_userId_day_key" ON "daily_upload_counters"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "upload_usages_snapId_key" ON "upload_usages"("snapId");

-- CreateIndex
CREATE INDEX "upload_usages_userId_createdAt_idx" ON "upload_usages"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "spark_transactions" ADD CONSTRAINT "spark_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_spark_earn_counters" ADD CONSTRAINT "daily_spark_earn_counters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_upload_counters" ADD CONSTRAINT "daily_upload_counters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_usages" ADD CONSTRAINT "upload_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_usages" ADD CONSTRAINT "upload_usages_snapId_fkey" FOREIGN KEY ("snapId") REFERENCES "snaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
