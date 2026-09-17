"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlowButton } from "@/components/ui/glow-button";

export default function TelegramConnectClient({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as { error?: string; success?: boolean };
      if (!response.ok || !data.success) {
        setError(data.error ?? "Unable to connect Telegram.");
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        router.push("/profile");
      }, 1500);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <p className="text-sm text-foreground">
        Telegram connected. You can return to the bot and send /upload.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Confirm linking this Snappy account to Telegram. The link is single-use
        and expires shortly after you request it in the bot.
      </p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <GlowButton
        type="button"
        onClick={() => void handleConnect()}
        disabled={loading}
        className="w-full justify-center"
      >
        {loading ? "Connecting…" : "Connect Telegram"}
      </GlowButton>
    </div>
  );
}
