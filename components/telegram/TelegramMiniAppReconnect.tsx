"use client";

import { GlowButton } from "@/components/ui/glow-button";

type TelegramMiniAppReconnectProps = {
  title?: string;
  description?: string;
  actionLabel?: string;
  onReconnect: () => void;
};

export default function TelegramMiniAppReconnect({
  title = "Your Snappy session has expired.",
  description = "Reconnect with Telegram to continue.",
  actionLabel = "Reconnect",
  onReconnect,
}: TelegramMiniAppReconnectProps) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
      <p className="text-sm text-foreground">{title}</p>
      {description ? (
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      ) : null}
      <GlowButton
        type="button"
        className="mt-6 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
        onClick={onReconnect}
      >
        {actionLabel}
      </GlowButton>
    </div>
  );
}
