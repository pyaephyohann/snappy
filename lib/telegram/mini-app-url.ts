import { getSnappyPublicUrl } from "./public-url";

export function buildTelegramMiniAppUrl(): string | null {
  const origin = getSnappyPublicUrl();
  if (!origin) {
    return null;
  }
  return `${origin.replace(/\/$/, "")}/telegram/app`;
}
