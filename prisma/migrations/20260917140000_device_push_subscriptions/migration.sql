-- Drop account-based notification history (read state is per-device in localStorage)
DROP TABLE IF EXISTS "notifications";
DROP TYPE IF EXISTS "NotificationType";

-- Re-scope push subscriptions to anonymous devices
DELETE FROM "push_subscriptions";

ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_userId_fkey";
DROP INDEX IF EXISTS "push_subscriptions_userId_idx";
ALTER TABLE "push_subscriptions" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "push_subscriptions" ADD COLUMN "deviceId" TEXT NOT NULL;

CREATE INDEX "push_subscriptions_deviceId_idx" ON "push_subscriptions"("deviceId");
