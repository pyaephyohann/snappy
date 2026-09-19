import { normalizeSnapLookupCode } from "@/lib/snap-code";
import { TELEGRAM_MINI_APP_START_PARAM_MAX_LENGTH } from "./mini-app-request-limits";
import { buildTelegramMiniAppUrl } from "./mini-app-url";
import {
  TELEGRAM_MINI_APP_ROUTES,
  type TelegramMiniAppScreen,
} from "./mini-app-routes";

export const TELEGRAM_MINI_APP_QUERY = {
  screen: "screen",
  code: "code",
} as const;

/** Canonical HTTPS deep link: /telegram/app?screen=find&code=<cuid> */
export function buildTelegramMiniAppDeepLink(options?: {
  screen?: TelegramMiniAppScreen;
  code?: string;
}): string | null {
  const origin = buildTelegramMiniAppUrl();
  if (!origin) {
    return null;
  }

  const url = new URL(origin);
  if (options?.screen) {
    url.searchParams.set(TELEGRAM_MINI_APP_QUERY.screen, options.screen);
  }
  if (options?.code) {
    const normalized = normalizeSnapLookupCode(options.code);
    if (normalized.ok) {
      url.searchParams.set(TELEGRAM_MINI_APP_QUERY.code, normalized.code);
    }
  }
  return url.toString();
}

/**
 * Telegram `startapp` / WebApp `start_param` compact form.
 * Examples: `find`, `find_<cuid>`, `upload`, `profile`, `home`
 */
export function normalizeTelegramMiniAppStartParam(
  startParam: string | null | undefined,
): string | null {
  if (startParam == null) {
    return null;
  }
  const trimmed = startParam.trim();
  if (!trimmed || trimmed.length > TELEGRAM_MINI_APP_START_PARAM_MAX_LENGTH) {
    return null;
  }
  return trimmed;
}

export function parseTelegramMiniAppStartParam(
  startParam: string,
): { screen: TelegramMiniAppScreen | null; code: string | null } {
  const trimmed = normalizeTelegramMiniAppStartParam(startParam);
  if (!trimmed) {
    return { screen: null, code: null };
  }

  const lower = trimmed.toLowerCase();
  if (lower === "home") {
    return { screen: "home", code: null };
  }
  if (lower === "find") {
    return { screen: "find", code: null };
  }
  if (lower === "search") {
    return { screen: "search", code: null };
  }
  if (lower === "camera") {
    return { screen: "camera", code: null };
  }
  if (lower.startsWith("find_")) {
    const rawCode = trimmed.slice("find_".length);
    const normalized = normalizeSnapLookupCode(rawCode);
    if (normalized.ok) {
      return { screen: "find", code: normalized.code };
    }
    return { screen: "find", code: null };
  }
  if (lower === "upload") {
    return { screen: "upload", code: null };
  }
  if (lower === "alerts") {
    return { screen: "alerts", code: null };
  }
  if (lower === "profile") {
    return { screen: "profile", code: null };
  }

  return { screen: null, code: null };
}

export function buildTelegramMiniAppStartParam(options: {
  screen: TelegramMiniAppScreen;
  code?: string;
}): string | null {
  if (options.screen === "home") {
    return "home";
  }
  if (options.screen === "find") {
    if (options.code) {
      const normalized = normalizeSnapLookupCode(options.code);
      if (normalized.ok) {
        return `find_${normalized.code}`;
      }
    }
    return "find";
  }
  if (options.screen === "search") {
    return "search";
  }
  if (options.screen === "camera") {
    return "camera";
  }
  if (options.screen === "upload") {
    return "upload";
  }
  if (options.screen === "alerts") {
    return "alerts";
  }
  if (options.screen === "profile") {
    return "profile";
  }
  return null;
}

/**
 * Resolves Mini App navigation from URL query and optional Telegram start_param.
 * Returns a path (+ optional ?code=) for router.replace, or null if no redirect needed.
 */
export function resolveTelegramMiniAppDeepLinkTarget(
  pathname: string,
  searchParams: URLSearchParams,
  startParam?: string | null,
): string | null {
  let screen = searchParams.get(TELEGRAM_MINI_APP_QUERY.screen)?.trim().toLowerCase();
  let code = searchParams.get(TELEGRAM_MINI_APP_QUERY.code);

  const normalizedStartParam = normalizeTelegramMiniAppStartParam(startParam);
  if (!screen && normalizedStartParam) {
    const parsed = parseTelegramMiniAppStartParam(normalizedStartParam);
    screen = parsed.screen ?? undefined;
    if (!code && parsed.code) {
      code = parsed.code;
    }
  }

  if (!screen) {
    return null;
  }

  if (screen === "home") {
    if (
      searchParams.has(TELEGRAM_MINI_APP_QUERY.screen) ||
      searchParams.has(TELEGRAM_MINI_APP_QUERY.code)
    ) {
      return TELEGRAM_MINI_APP_ROUTES.home;
    }
    return null;
  }

  if (!(screen in TELEGRAM_MINI_APP_ROUTES)) {
    return TELEGRAM_MINI_APP_ROUTES.home;
  }

  const route = TELEGRAM_MINI_APP_ROUTES[screen as TelegramMiniAppScreen];
  if (screen === "find") {
    let target: string = route;
    if (code?.trim()) {
      const normalized = normalizeSnapLookupCode(code);
      if (normalized.ok) {
        target = `${route}?${TELEGRAM_MINI_APP_QUERY.code}=${encodeURIComponent(normalized.code)}`;
      }
    }
    if (formatPathWithQuery(pathname, searchParams) !== target) {
      return target;
    }
    return null;
  }

  if (pathname !== route) {
    return route;
  }
  return null;
}

function formatPathWithQuery(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
