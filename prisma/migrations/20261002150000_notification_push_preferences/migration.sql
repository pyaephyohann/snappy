-- Additive: per-user PWA push mute preferences. Existing users have no row
-- and are treated as "all categories enabled", so current push behavior is
-- preserved and no notification data is touched.
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newSnapPush" BOOLEAN NOT NULL DEFAULT true,
    "messagePush" BOOLEAN NOT NULL DEFAULT true,
    "reactionPush" BOOLEAN NOT NULL DEFAULT true,
    "commentPush" BOOLEAN NOT NULL DEFAULT true,
    "birthdayPush" BOOLEAN NOT NULL DEFAULT true,
    "followPush" BOOLEAN NOT NULL DEFAULT true,
    "followAcceptedPush" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
