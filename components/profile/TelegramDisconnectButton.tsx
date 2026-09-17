"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlowButton } from "@/components/ui/glow-button";

export default function TelegramDisconnectButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/unlink", {
        method: "POST",
        credentials: "include",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Unable to disconnect.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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
        onClick={() => void handleDisconnect()}
        className="w-full justify-center text-sm"
      >
        {loading ? "Disconnecting…" : "Disconnect Telegram"}
      </GlowButton>
    </div>
  );
}
