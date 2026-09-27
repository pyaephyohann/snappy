-- S7-A — Provider-independent subscription purchase foundation.
-- Additive only: create one purchase-attempt enum and table plus indexes/FKs.
-- Existing subscriptions and Spark ledger rows are neither modified nor rewritten.

CREATE TYPE "PurchaseStatus" AS ENUM (
  'INITIALIZED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
  'EXPIRED'
);

CREATE TABLE "subscription_purchases" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestedPlan" "SubscriptionPlan" NOT NULL,
  "amountMmk" INTEGER NOT NULL,
  "planConfigVersion" TEXT NOT NULL DEFAULT '1',
  "currency" TEXT NOT NULL DEFAULT 'MMK',
  "orderReferenceId" TEXT NOT NULL,
  "idempotencyKeyHash" TEXT NOT NULL,
  "providerReferenceId" TEXT,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'INITIALIZED',
  "failureReason" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentInitiatedAt" TIMESTAMP(3),
  "paymentSucceededAt" TIMESTAMP(3),
  "paymentFailedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "periodStart" TIMESTAMP(3),
  "subscriptionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subscription_purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_purchases_orderReferenceId_key"
  ON "subscription_purchases"("orderReferenceId");
CREATE UNIQUE INDEX "subscription_purchases_userId_idempotencyKeyHash_key"
  ON "subscription_purchases"("userId", "idempotencyKeyHash");
CREATE UNIQUE INDEX "subscription_purchases_providerReferenceId_key"
  ON "subscription_purchases"("providerReferenceId");
CREATE INDEX "subscription_purchases_userId_status_createdAt_idx"
  ON "subscription_purchases"("userId", "status", "createdAt");
CREATE INDEX "subscription_purchases_status_expiresAt_idx"
  ON "subscription_purchases"("status", "expiresAt");

ALTER TABLE "subscription_purchases"
  ADD CONSTRAINT "subscription_purchases_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_purchases"
  ADD CONSTRAINT "subscription_purchases_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
