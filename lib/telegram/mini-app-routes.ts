export const TELEGRAM_MINI_APP_ROOT = "/telegram/app";

export const TELEGRAM_MINI_APP_ROUTES = {
  home: TELEGRAM_MINI_APP_ROOT,
  search: `${TELEGRAM_MINI_APP_ROOT}/search`,
  camera: `${TELEGRAM_MINI_APP_ROOT}/camera`,
  upload: `${TELEGRAM_MINI_APP_ROOT}/upload`,
  alerts: `${TELEGRAM_MINI_APP_ROOT}/alerts`,
  profile: `${TELEGRAM_MINI_APP_ROOT}/profile`,
  // Kept for existing Snap-code deep links; Search is the primary nav surface.
  find: `${TELEGRAM_MINI_APP_ROOT}/find`,
} as const;

export type TelegramMiniAppScreen = keyof typeof TELEGRAM_MINI_APP_ROUTES;

const SCREEN_PARAM = "screen";

/** @deprecated Use resolveTelegramMiniAppDeepLinkTarget from mini-app-deep-link.ts */
export function resolveTelegramMiniAppScreenPath(
  pathname: string,
  searchParams: URLSearchParams,
): string | null {
  const screen = searchParams.get(SCREEN_PARAM)?.trim().toLowerCase();
  if (!screen) {
    return null;
  }
  if (screen === "home") {
    return TELEGRAM_MINI_APP_ROUTES.home;
  }
  if (screen in TELEGRAM_MINI_APP_ROUTES) {
    return TELEGRAM_MINI_APP_ROUTES[screen as TelegramMiniAppScreen];
  }
  return null;
}

export function isTelegramMiniAppRootPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/";
  return normalized === TELEGRAM_MINI_APP_ROOT;
}

export function isTelegramMiniAppPath(pathname: string): boolean {
  return (
    pathname === TELEGRAM_MINI_APP_ROOT ||
    pathname.startsWith(`${TELEGRAM_MINI_APP_ROOT}/`)
  );
}
