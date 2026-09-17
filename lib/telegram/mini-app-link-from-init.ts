import { getAuthenticatedAppUser } from "@/lib/auth";
import { requireTelegramBotToken } from "./env";
import {
  getTelegramInitDataMaxAgeSeconds,
  validateTelegramInitData,
} from "./init-data";
import {
  completeTelegramLink,
  createTelegramLinkChallenge,
} from "./link-service";

export type MiniAppLinkFromInitResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Links the verified Mini App Telegram identity to the authenticated Snappy user.
 * Reuses T3 challenge + completeTelegramLink on the server (no username matching).
 */
export async function linkAuthenticatedUserFromInitData(
  initData: string,
): Promise<MiniAppLinkFromInitResult> {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  let botToken: string;
  try {
    botToken = requireTelegramBotToken();
  } catch {
    return { ok: false, error: "Telegram is not configured." };
  }

  const validated = validateTelegramInitData(initData, botToken, {
    maxAgeSeconds: getTelegramInitDataMaxAgeSeconds(),
  });
  if (!validated.ok) {
    return { ok: false, error: "Telegram identity could not be verified." };
  }

  const { token } = await createTelegramLinkChallenge({
    telegramUserId: validated.user.telegramUserId,
  });

  const result = await completeTelegramLink({
    token,
    snappyUserId: user.id,
    snappyUserActive: true,
    telegramUsername: validated.user.username,
  });

  if (!result.ok) {
    return { ok: false, error: mapLinkError(result.error) };
  }

  return { ok: true };
}

function mapLinkError(
  error: Exclude<
    Awaited<ReturnType<typeof completeTelegramLink>>,
    { ok: true }
  >["error"],
): string {
  switch (error) {
    case "telegram_taken":
      return "This Telegram account is already linked to another Snappy user.";
    case "user_already_linked":
      return "Your Snappy account is already linked to a different Telegram account.";
    case "user_inactive":
      return "Your Snappy account is not active.";
    default:
      return "Unable to connect Telegram.";
  }
}
