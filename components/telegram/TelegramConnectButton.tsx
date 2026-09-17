"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GlowButton } from "@/components/ui/glow-button";

/** Canonical Connect Telegram control — shared across profile and /telegram/connect */
export const TELEGRAM_CONNECT_BUTTON_CLASSNAME =
  "w-full justify-center rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50";

type MetaResponse = {
  botUrl: string | null;
};

type TelegramConnectButtonProps = {
  /** When provided, confirms link via POST /api/telegram/link (connect page). */
  linkToken?: string;
};

function ConnectTelegramControl({
  loading,
  loadingLabel,
  onClick,
}: {
  loading: boolean;
  loadingLabel: string;
  onClick: () => void;
}) {
  return (
    <GlowButton
      type="button"
      disabled={loading}
      onClick={onClick}
      className={TELEGRAM_CONNECT_BUTTON_CLASSNAME}
    >
      {loading ? loadingLabel : "Connect Telegram"}
    </GlowButton>
  );
}

export default function TelegramConnectButton({
  linkToken,
}: TelegramConnectButtonProps = {}) {
  const router = useRouter();
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);

  const isLinkMode = linkToken !== undefined && linkToken.length > 0;

  useEffect(() => {
    if (isLinkMode) return;

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
  }, [isLinkMode]);

  async function handleLinkConnect() {
    if (!linkToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: linkToken }),
      });
      const data = (await response.json()) as {
        error?: string;
        success?: boolean;
      };
      if (!response.ok || !data.success) {
        setError(data.error ?? "Unable to connect Telegram.");
        return;
      }
      setLinkSuccess(true);
      setTimeout(() => {
        router.push("/profile");
      }, 1500);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenBot() {
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

  if (isLinkMode && linkSuccess) {
    return (
      <p className="text-sm text-foreground">
        Telegram connected. You can return to the bot and send /upload.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {isLinkMode ? (
        <p className="text-sm text-muted-foreground">
          Confirm linking this Snappy account to Telegram. The link is
          single-use and expires shortly after you request it in the bot.
        </p>
      ) : null}

      {error ? (
        <p
          className={`text-sm text-destructive ${isLinkMode ? "" : "text-xs"}`}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <ConnectTelegramControl
        loading={loading}
        loadingLabel={isLinkMode ? "Connecting…" : "Opening…"}
        onClick={() => {
          if (isLinkMode) {
            void handleLinkConnect();
          } else {
            handleOpenBot();
          }
        }}
      />

      {!isLinkMode ? (
        <p className="text-xs text-muted-foreground">
          In the bot, send /upload to get your secure connect link.
        </p>
      ) : null}
    </div>
  );
}
