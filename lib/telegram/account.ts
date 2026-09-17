import { prisma } from "@/lib/prisma";

export type LinkedTelegramAccount = {
  id: string;
  telegramUserId: string;
  telegramUsername: string | null;
  userId: string;
  userName: string;
};

export async function getLinkedAccountByTelegramUserId(
  telegramUserId: string,
): Promise<LinkedTelegramAccount | null> {
  const row = await prisma.telegramAccount.findUnique({
    where: { telegramUserId },
    include: {
      user: { select: { id: true, name: true, isActive: true } },
    },
  });
  if (!row || !row.user.isActive) {
    return null;
  }
  return {
    id: row.id,
    telegramUserId: row.telegramUserId,
    telegramUsername: row.telegramUsername,
    userId: row.user.id,
    userName: row.user.name,
  };
}

export async function getLinkedAccountByUserId(
  userId: string,
): Promise<{ telegramUserId: string; telegramUsername: string | null } | null> {
  const row = await prisma.telegramAccount.findUnique({
    where: { userId },
    select: { telegramUserId: true, telegramUsername: true },
  });
  return row;
}

export async function unlinkTelegramAccountForUser(userId: string): Promise<boolean> {
  const result = await prisma.telegramAccount.deleteMany({
    where: { userId },
  });
  return result.count > 0;
}
