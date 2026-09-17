"use client";

import { useEffect, useState } from "react";

type MetaResponse = {
  botUrl: string | null;
  botFindUrl: string | null;
};

type TelegramOpenBotLinkProps = {
  label: string;
  /** Uses `botFindUrl` when set, otherwise `botUrl`. */
  variant?: "bot" | "find";
  className?: string;
};

export default function TelegramOpenBotLink({
  label,
  variant = "bot",
  className = "text-sm text-primary underline",
}: TelegramOpenBotLinkProps) {
  const [meta, setMeta] = useState<MetaResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/telegram/mini-app/meta");
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as MetaResponse;
        if (!cancelled) {
          setMeta(body);
        }
      } catch {
        // omit link when meta unavailable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const url =
    variant === "find" ? meta?.botFindUrl ?? meta?.botUrl : meta?.botUrl;
  if (!url) {
    return null;
  }

  return (
    <button type="button" className={className} onClick={() => openBot(url)}>
      {label}
    </button>
  );
}

function openBot(url: string) {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(url);
    return;
  }
  webApp?.openLink(url);
}
