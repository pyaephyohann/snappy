-- S4 — Subscription Foundation
--
-- Migration safety notes (existing production databases):
-- * Entirely additive except for one unique index WIDENING.
-- * Existing users get no subscriptions row and are implicitly FREE
--   (resolveEffectivePlan falls back to the FREE plan configuration).
-- * Existing Spark ledger rows are NOT modified, deleted, or rewritten.
-- * The unique index (userId, type, referenceId) is widened to
--   (userId, type, referenceId, sparkKind) so a spend can record one debit
--   per Spark kind under the same logical reference. Every existing row
--   already satisfies the wider constraint (it is strictly weaker).

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'SPARK_PLUS', 'SPARK_PRO', 'SPARK_ULTRA');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'EXPIRED');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE INDEX "subscriptions_status_currentPeriodEnd_idx" ON "subscriptions"("status", "currentPeriodEnd");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Widen the Spark ledger idempotency unique constraint per kind
-- (no data is modified; the new constraint is strictly weaker).
DROP INDEX "spark_transactions_userId_type_referenceId_key";
CREATE UNIQUE INDEX "spark_transactions_userId_type_referenceId_sparkKind_key" ON "spark_transactions"("userId", "type", "referenceId", "sparkKind");
