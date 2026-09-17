-- Pagination state for Telegram /find-friends (per chat, serverless-safe).
ALTER TABLE "telegram_chat_states"
ADD COLUMN "findFriendsFriendId" TEXT,
ADD COLUMN "findFriendsOffset" INTEGER NOT NULL DEFAULT 0;
