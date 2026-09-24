-- S7 — User Status / Presence
-- Additive only: nullable presence timestamp, no default, no backfill, no index.
ALTER TABLE "users" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
