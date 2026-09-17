"use client";

import { useCallback, useEffect, useState } from "react";

export type TelegramWebAppState = {
  isTelegram: boolean;
  isReady: boolean;
  initData: string;
  displayUsername: string | null;
  colorScheme: "light" | "dark" | null;
};

const INITIAL_STATE: TelegramWebAppState = {
  isTelegram: false,
  isReady: false,
  initData: "",
  displayUsername: null,
  colorScheme: null,
};

export function useTelegramWebApp(): TelegramWebAppState & {
  openExternalLink: (url: string) => void;
} {
  const [state, setState] = useState<TelegramWebAppState>(INITIAL_STATE);

  const openExternalLink = useCallback((url: string) => {
    const webApp = window.Telegram?.WebApp;
    if (webApp) {
      webApp.openLink(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;

    const applyDomSideEffects = (app: TelegramWebApp) => {
      app.ready();
      app.expand();

      const root = document.documentElement;
      root.style.setProperty("--tg-viewport-height", `${app.viewportHeight}px`);
      root.style.setProperty(
        "--tg-viewport-stable-height",
        `${app.viewportStableHeight}px`,
      );

      if (app.colorScheme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    if (!webApp) {
      queueMicrotask(() => {
        setState((previous) => ({
          ...previous,
          isTelegram: false,
          isReady: true,
        }));
      });
      return;
    }

    applyDomSideEffects(webApp);

    const unsafeUser = webApp.initDataUnsafe.user;
    queueMicrotask(() => {
      setState({
        isTelegram: true,
        isReady: true,
        initData: webApp.initData,
        displayUsername:
          typeof unsafeUser?.username === "string" ? unsafeUser.username : null,
        colorScheme: webApp.colorScheme,
      });
    });
  }, []);

  return { ...state, openExternalLink };
}
