-- D2 — Download Snap Limit with Sparks: Daily Download Counter
-- Additive only: create daily_download_counters table for per-user daily download accounting.

CREATE TABLE "daily_download_counters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_download_counters_pkey" PRIMARY KEY ("id")
);

-- Unique index per user and Yangon calendar day
CREATE UNIQUE INDEX "daily_download_counters_userId_day_key" ON "daily_download_counters"("userId", "day");

-- Foreign key referencing users(id) with CASCADE
ALTER TABLE "daily_download_counters" ADD CONSTRAINT "daily_download_counters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
