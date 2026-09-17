"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import TelegramBottomNav from "@/components/telegram/TelegramBottomNav";
import { useTelegramBackButton } from "@/hooks/useTelegramBackButton";
import {
  isTelegramMiniAppRootPath,
  resolveTelegramMiniAppScreenPath,
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
  const isRoot = isTelegramMiniAppRootPath(pathname);

  useTelegramBackButton(isRoot);

  useEffect(() => {
    const target = resolveTelegramMiniAppScreenPath(
      pathname,
      new URLSearchParams(searchParams.toString()),
    );
    if (target && target !== pathname) {
      router.replace(target);
    }
  }, [pathname, router, searchParams]);

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
