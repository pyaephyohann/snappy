"use client";

import { useEffect, useState } from "react";
import { GlowButton } from "@/components/ui/glow-button";

type MetaResponse = {
  botUrl: string | null;
};

/**
 * Opens the Snappy Telegram bot so the user can start the existing link flow
 * (/upload → connect URL). Matches TelegramConnectClient button styling.
 */
export default function TelegramConnectButton() {
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/telegram/mini-app/meta");
        if (!response.ok) return;
        const body = (await response.json()) as MetaResponse;
        if (!cancelled) {
          setBotUrl(body.botUrl);
        }
      } catch {
        // omit when meta unavailable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleClick() {
    if (!botUrl) {
      setError(
        "Telegram bot is not configured. Open the bot from Telegram to connect.",
      );
      return;
    }
    setLoading(true);
    setError(null);
    window.open(botUrl, "_blank", "noopener,noreferrer");
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <GlowButton
        type="button"
        disabled={loading}
        onClick={handleClick}
        className="w-full justify-center rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? "Opening…" : "Connect Telegram"}
      </GlowButton>
      <p className="text-xs text-muted-foreground">
        In the bot, send /upload to get your secure connect link. No token is
        stored in this page.
      </p>
    </div>
  );
}
