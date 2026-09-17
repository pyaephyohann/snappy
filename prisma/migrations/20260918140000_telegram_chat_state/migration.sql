-- CreateTable
CREATE TABLE "telegram_chat_states" (
    "chatId" TEXT NOT NULL,
    "awaitingMode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_chat_states_pkey" PRIMARY KEY ("chatId")
);
