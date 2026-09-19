-- AlterTable: Add birthday column to users
ALTER TABLE "users" ADD COLUMN "birthday" TIMESTAMP(3);

-- AlterEnum: Add BIRTHDAY to NotificationType
ALTER TYPE "NotificationType" ADD VALUE 'BIRTHDAY';
