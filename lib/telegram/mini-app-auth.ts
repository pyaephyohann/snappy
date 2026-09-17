import { createSession } from "@/lib/auth";
import { getLinkedAccountByTelegramUserId } from "./account";
import { buildTelegramConnectUrl } from "./connect-url";
import { requireTelegramBotToken } from "./env";
import { createTelegramLinkChallenge } from "./link-service";
import {
  getTelegramInitDataMaxAgeSeconds,
  validateTelegramInitData,
  type VerifiedTelegramWebAppUser,
} from "./init-data";
import { TELEGRAM_MINI_APP_INIT_DATA_MAX_BYTES } from "./mini-app-request-limits";

export type MiniAppSessionResult =
  | {
      status: "linked";
      snappyUserName: string;
      telegramUsername: string | null;
      telegramUserId: string;
    }
  | {
      status: "unlinked";
      connectUrl: string | null;
      telegramUsername: string | null;
      telegramUserId: string;
    }
  | {
      status: "invalid";
      reason: string;
    };

export async function establishMiniAppSessionFromInitData(
  initData: string,
): Promise<MiniAppSessionResult> {
  if (Buffer.byteLength(initData, "utf8") > TELEGRAM_MINI_APP_INIT_DATA_MAX_BYTES) {
    return { status: "invalid", reason: "Invalid Telegram initialization data." };
  }

  let botToken: string;
  try {
    botToken = requireTelegramBotToken();
  } catch {
    return { status: "invalid", reason: "Telegram is not configured" };
  }

  const validated = validateTelegramInitData(initData, botToken, {
    maxAgeSeconds: getTelegramInitDataMaxAgeSeconds(),
  });
  if (!validated.ok) {
    return { status: "invalid", reason: mapInitDataFailure(validated.reason) };
  }

  return resolveMiniAppSessionForVerifiedUser(validated.user);
}

export async function resolveMiniAppSessionForVerifiedUser(
  telegramUser: VerifiedTelegramWebAppUser,
): Promise<MiniAppSessionResult> {
  const linked = await getLinkedAccountByTelegramUserId(telegramUser.telegramUserId);
  if (!linked) {
    const { token } = await createTelegramLinkChallenge({
      telegramUserId: telegramUser.telegramUserId,
    });
    return {
      status: "unlinked",
      connectUrl: buildTelegramConnectUrl(token),
      telegramUsername: telegramUser.username,
      telegramUserId: telegramUser.telegramUserId,
    };
  }

  await createSession(linked.userName, "USER", linked.userId);

  return {
    status: "linked",
    snappyUserName: linked.userName,
    telegramUsername: telegramUser.username ?? linked.telegramUsername,
    telegramUserId: telegramUser.telegramUserId,
  };
}

function mapInitDataFailure(
  reason: Extract<
    ReturnType<typeof validateTelegramInitData>,
    { ok: false }
  >["reason"],
): string {
  switch (reason) {
    case "missing":
      return "Missing Telegram initialization data.";
    case "malformed":
      return "Invalid Telegram initialization data.";
    case "missing_hash":
      return "Telegram initialization data is incomplete.";
    case "invalid_signature":
      return "Telegram initialization data could not be verified.";
    case "expired":
      return "Telegram session expired. Close and reopen the Mini App.";
    case "missing_user":
    case "invalid_user":
      return "Telegram user information is missing.";
    default:
      return "Unable to verify Telegram identity.";
  }
}
