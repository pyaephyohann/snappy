"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TELEGRAM_MINI_APP_ROUTES } from "@/lib/telegram/mini-app-routes";

export function useTelegramBackButton(isRoot: boolean): void {
  const router = useRouter();

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) {
      return;
    }

    const onBack = () => {
      router.push(TELEGRAM_MINI_APP_ROUTES.home);
    };

    if (isRoot) {
      webApp.BackButton.hide();
      return () => {
        webApp.BackButton.offClick(onBack);
      };
    }

    webApp.BackButton.show();
    webApp.BackButton.onClick(onBack);

    return () => {
      webApp.BackButton.offClick(onBack);
      webApp.BackButton.hide();
    };
  }, [isRoot, router]);
}
