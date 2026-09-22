-- CreateEnum
CREATE TYPE "NotificationType_new" AS ENUM ('NEW_SNAP', 'NEW_MESSAGE', 'REACTION', 'COMMENT', 'BIRTHDAY');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "messageId" TEXT;

-- Convert the existing enum without changing existing values.
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new"
USING ("type"::text::"NotificationType_new");
DROP TYPE "NotificationType";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";

-- CreateIndex
CREATE UNIQUE INDEX "notifications_messageId_key" ON "notifications"("messageId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
