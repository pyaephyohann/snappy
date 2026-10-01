-- Additive: follow notifications reuse the existing Notification table/API.
-- No tables are created, altered, or dropped.
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW';
