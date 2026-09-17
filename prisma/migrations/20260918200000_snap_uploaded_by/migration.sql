-- Attribution: who uploaded the Snap (may differ from profile owner userId).
ALTER TABLE "snaps"
ADD COLUMN "uploadedById" TEXT;

CREATE INDEX "snaps_uploadedById_idx" ON "snaps"("uploadedById");

ALTER TABLE "snaps" ADD CONSTRAINT "snaps_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
