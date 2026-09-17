"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isTelegramMiniAppPath } from "@/lib/telegram/mini-app-routes";

const DISMISS_KEY = "snappy_pwa_install_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (pathname && isTelegramMiniAppPath(pathname)) {
      return;
    }

    if (isStandaloneDisplay()) {
      return;
    }

    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") {
        return;
      }
    } catch {
      return;
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    if (isIosSafari()) {
      const timer = window.setTimeout(() => {
        setShowIosHint(true);
        setVisible(true);
      }, 8000);
      return () => {
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
        window.clearTimeout(timer);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, [pathname]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setDeferredPrompt(null);
    setShowIosHint(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore storage errors
    }
  }, []);

  const onInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    dismiss();
  }, [deferredPrompt, dismiss]);

  if (pathname && isTelegramMiniAppPath(pathname)) {
    return null;
  }

  if (!visible) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Install Snappy"
      className="safe-area-bottom-fixed safe-area-fixed-inset-x fixed z-[9998] mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl shadow-black/40 sm:left-auto sm:right-[max(1.5rem,var(--safe-area-inset-right))] sm:max-w-md"
    >
      <div className="flex flex-col gap-3">
        <div>
          <p className="font-semibold text-foreground">Install Snappy</p>
          {showIosHint && !deferredPrompt ? (
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              Tap <span className="text-foreground">Share</span>, then{" "}
              <span className="text-foreground">Add to Home Screen</span> to
              install Snappy on this device.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Add Snappy to your home screen for quick access.
            </p>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Not now
          </button>
          {deferredPrompt ? (
            <button
              type="button"
              onClick={onInstall}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Install
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
