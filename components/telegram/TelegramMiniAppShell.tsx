"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import TelegramBottomNav from "@/components/telegram/TelegramBottomNav";
import { useTelegramBackButton } from "@/hooks/useTelegramBackButton";
import { useTelegramMiniAppStartParam } from "@/hooks/useTelegramMiniAppStartParam";
import { resolveTelegramMiniAppDeepLinkTarget } from "@/lib/telegram/mini-app-deep-link";
import {
  isTelegramMiniAppRootPath,
  TELEGRAM_MINI_APP_ROUTES,
} from "@/lib/telegram/mini-app-routes";

const NAV_CLEARANCE =
  "calc(4.25rem + max(0.5rem, env(safe-area-inset-bottom)))";

export default function TelegramMiniAppShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const startParam = useTelegramMiniAppStartParam();
  const isRoot = isTelegramMiniAppRootPath(pathname);
  const isFindRoute = pathname.startsWith(TELEGRAM_MINI_APP_ROUTES.find);
  const isSearchRoute = pathname.startsWith(TELEGRAM_MINI_APP_ROUTES.search);
  const isCameraRoute = pathname.startsWith(TELEGRAM_MINI_APP_ROUTES.camera);
  const isUploadRoute = pathname.startsWith(TELEGRAM_MINI_APP_ROUTES.upload);
  const isAlertsRoute = pathname.startsWith(TELEGRAM_MINI_APP_ROUTES.alerts);
  const isProfileRoute = pathname.startsWith(TELEGRAM_MINI_APP_ROUTES.profile);

  const handleShellBack = useCallback(() => {
    router.push(TELEGRAM_MINI_APP_ROUTES.home);
  }, [router]);

  useTelegramBackButton({
    enabled:
      !isRoot &&
      !isFindRoute &&
      !isSearchRoute &&
      !isCameraRoute &&
      !isUploadRoute &&
      !isAlertsRoute &&
      !isProfileRoute,
    onBack: handleShellBack,
  });

  useEffect(() => {
    const target = resolveTelegramMiniAppDeepLinkTarget(
      pathname,
      new URLSearchParams(searchParams.toString()),
      startParam,
    );
    if (target) {
      router.replace(target);
    }
  }, [pathname, router, searchParams, startParam]);

  return (
    <div className="flex min-h-[var(--tg-viewport-stable-height,100dvh)] flex-col bg-background text-foreground">
      <div
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingBottom: NAV_CLEARANCE,
        }}
      >
        {children}
      </div>
      <TelegramBottomNav />
    </div>
  );
}
