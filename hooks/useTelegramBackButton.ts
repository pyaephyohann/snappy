"use client";

import { useEffect } from "react";

export function useTelegramBackButton(options: {
  enabled: boolean;
  onBack: () => void;
}): void {
  const { enabled, onBack } = options;

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) {
      return;
    }

    if (!enabled) {
      webApp.BackButton.hide();
      return;
    }

    webApp.BackButton.show();
    webApp.BackButton.onClick(onBack);

    return () => {
      webApp.BackButton.offClick(onBack);
      webApp.BackButton.hide();
    };
  }, [enabled, onBack]);
}
