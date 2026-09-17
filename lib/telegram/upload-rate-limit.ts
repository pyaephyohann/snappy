import { prisma } from "@/lib/prisma";
import {
  TELEGRAM_UPLOAD_MAX_PER_HOUR,
  TELEGRAM_UPLOAD_WINDOW_MS,
} from "./upload-rate-limit-constants";

export {
  TELEGRAM_UPLOAD_MAX_PER_HOUR,
  TELEGRAM_UPLOAD_WINDOW_MS,
} from "./upload-rate-limit-constants";

export async function isTelegramUploadRateLimited(
  telegramUserId: string,
  now = Date.now(),
): Promise<boolean> {
  const since = new Date(now - TELEGRAM_UPLOAD_WINDOW_MS);
  const count = await prisma.telegramUploadLog.count({
    where: {
      telegramUserId,
      createdAt: { gte: since },
    },
  });
  return count >= TELEGRAM_UPLOAD_MAX_PER_HOUR;
}

export async function recordTelegramUpload(telegramUserId: string): Promise<void> {
  await prisma.telegramUploadLog.create({
    data: { telegramUserId },
  });
}
