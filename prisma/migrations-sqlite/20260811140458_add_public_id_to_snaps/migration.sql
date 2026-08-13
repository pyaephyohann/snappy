/*
  Warnings:

  - Added the required column `publicId` to the `snaps` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_snaps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imageUrl" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "caption" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "snaps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_snaps" ("caption", "createdAt", "id", "imageUrl", "publicId", "updatedAt", "userId") SELECT "caption", "createdAt", "id", "imageUrl", 'legacy-snap-' || id, "updatedAt", "userId" FROM "snaps";
DROP TABLE "snaps";
ALTER TABLE "new_snaps" RENAME TO "snaps";
CREATE INDEX "snaps_userId_idx" ON "snaps"("userId");
CREATE INDEX "snaps_createdAt_idx" ON "snaps"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
