import { prisma } from "@/lib/prisma";
import {
  generateTelegramLinkToken,
  hashTelegramLinkToken,
  isLinkChallengeExpired,
  isLinkTokenFormatValid,
  TELEGRAM_LINK_TTL_MS,
} from "./link-token";

export type CreateLinkChallengeResult = {
  token: string;
  expiresAt: Date;
};

export async function createTelegramLinkChallenge(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
}): Promise<CreateLinkChallengeResult> {
  const { token, tokenHash } = generateTelegramLinkToken();
  const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TTL_MS);

  await prisma.telegramLinkChallenge.create({
    data: {
      tokenHash,
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId ?? null,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export type CompleteLinkResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "invalid_token"
        | "expired"
        | "already_used"
        | "telegram_taken"
        | "user_already_linked"
        | "user_inactive";
    };

export async function completeTelegramLink(input: {
  token: string;
  snappyUserId: string;
  snappyUserActive: boolean;
  telegramUsername?: string | null;
}): Promise<CompleteLinkResult> {
  if (!isLinkTokenFormatValid(input.token)) {
    return { ok: false, error: "invalid_token" };
  }
  if (!input.snappyUserActive) {
    return { ok: false, error: "user_inactive" };
  }

  const tokenHash = hashTelegramLinkToken(input.token);

  return prisma.$transaction(async (tx) => {
    const challenge = await tx.telegramLinkChallenge.findUnique({
      where: { tokenHash },
    });

    if (!challenge) {
      return { ok: false, error: "invalid_token" };
    }
    if (challenge.consumedAt) {
      return { ok: false, error: "already_used" };
    }
    if (isLinkChallengeExpired(challenge.expiresAt)) {
      return { ok: false, error: "expired" };
    }

    const existingForTelegram = await tx.telegramAccount.findUnique({
      where: { telegramUserId: challenge.telegramUserId },
    });
    if (existingForTelegram && existingForTelegram.userId !== input.snappyUserId) {
      return { ok: false, error: "telegram_taken" };
    }

    const existingForUser = await tx.telegramAccount.findUnique({
      where: { userId: input.snappyUserId },
    });
    if (existingForUser && existingForUser.telegramUserId !== challenge.telegramUserId) {
      return { ok: false, error: "user_already_linked" };
    }

    await tx.telegramLinkChallenge.update({
      where: { id: challenge.id },
      data: {
        consumedAt: new Date(),
        linkedUserId: input.snappyUserId,
      },
    });

    await tx.telegramAccount.upsert({
      where: { telegramUserId: challenge.telegramUserId },
      create: {
        telegramUserId: challenge.telegramUserId,
        telegramUsername: input.telegramUsername ?? null,
        userId: input.snappyUserId,
      },
      update: {
        telegramUsername: input.telegramUsername ?? null,
        userId: input.snappyUserId,
      },
    });

    return { ok: true };
  });
}
