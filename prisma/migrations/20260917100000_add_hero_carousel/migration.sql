-- CreateTable
CREATE TABLE "hero_carousel_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_carousel_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_carousel_slides" (
    "id" TEXT NOT NULL,
    "snapId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_carousel_slides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hero_carousel_slides_snapId_key" ON "hero_carousel_slides"("snapId");

-- CreateIndex
CREATE INDEX "hero_carousel_slides_sortOrder_idx" ON "hero_carousel_slides"("sortOrder");

-- AddForeignKey
ALTER TABLE "hero_carousel_slides" ADD CONSTRAINT "hero_carousel_slides_snapId_fkey" FOREIGN KEY ("snapId") REFERENCES "snaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
