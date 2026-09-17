-- Paid unlock for profile photo gallery upload (server-verified).
ALTER TABLE "users"
ADD COLUMN "profilePhotoGalleryUnlockedAt" TIMESTAMP(3);

CREATE TABLE "profile_photo_gallery_payments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_photo_gallery_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "profile_photo_gallery_payments_userId_createdAt_idx" ON "profile_photo_gallery_payments"("userId", "createdAt");

ALTER TABLE "profile_photo_gallery_payments" ADD CONSTRAINT "profile_photo_gallery_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
