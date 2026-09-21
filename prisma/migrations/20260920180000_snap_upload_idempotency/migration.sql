-- CreateTable
CREATE TABLE "snap_upload_operations" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapId" TEXT,
    "isFreeUpload" BOOLEAN,
    "sparkRewardCredited" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "snap_upload_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "snap_upload_operations_snapId_key" ON "snap_upload_operations"("snapId");
CREATE UNIQUE INDEX "snap_upload_operations_userId_idempotencyKey_key" ON "snap_upload_operations"("userId", "idempotencyKey");
CREATE INDEX "snap_upload_operations_userId_createdAt_idx" ON "snap_upload_operations"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "snap_upload_operations" ADD CONSTRAINT "snap_upload_operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snap_upload_operations" ADD CONSTRAINT "snap_upload_operations_snapId_fkey" FOREIGN KEY ("snapId") REFERENCES "snaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
