-- Per-user passcode authentication (replaces shared user passcode)
ALTER TABLE "users" ADD COLUMN "passcodeHash" TEXT;
ALTER TABLE "users" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "profileImageSnapId" TEXT;

CREATE UNIQUE INDEX "users_profileImageSnapId_key" ON "users"("profileImageSnapId");

ALTER TABLE "users" ADD CONSTRAINT "users_profileImageSnapId_fkey" FOREIGN KEY ("profileImageSnapId") REFERENCES "snaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
