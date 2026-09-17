import { getSnappyPublicUrl } from "./public-url";

export function buildTelegramConnectUrl(token: string): string | null {
  const origin = getSnappyPublicUrl();
  if (!origin) {
    return null;
  }
  const url = new URL("/telegram/connect", origin);
  url.searchParams.set("token", token);
  return url.toString();
}
