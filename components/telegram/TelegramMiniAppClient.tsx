"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlowButton } from "@/components/ui/glow-button";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";

type SessionPayload =
  | {
      linked: true;
      snappyUserName: string;
      telegramUsername: string | null;
      snappyUrl: string | null;
    }
  | {
      linked: false;
      connectUrl: string | null;
      telegramUsername: string | null;
    };

type SessionView =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: SessionPayload };

export default function TelegramMiniAppClient() {
  const { isTelegram, isReady, initData, displayUsername, openExternalLink } =
    useTelegramWebApp();
  const [sessionView, setSessionView] = useState<SessionView>({
    status: "idle",
  });

  const canAuthenticate =
    isReady && isTelegram && initData.trim().length > 0;

  useEffect(() => {
    if (!canAuthenticate) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/telegram/mini-app/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ initData }),
        });

        const body = (await response.json()) as SessionPayload & {
          error?: string;
        };

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setSessionView({
            status: "error",
            message: body.error ?? "Could not verify Telegram identity.",
          });
          return;
        }

        setSessionView({ status: "ready", payload: body });
      } catch {
        if (!cancelled) {
          setSessionView({
            status: "error",
            message: "Network error. Try again in a moment.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canAuthenticate, initData]);

  if (!isReady) {
    return <MiniAppFrame>{loadingBody()}</MiniAppFrame>;
  }

  if (!isTelegram || !initData.trim()) {
    return (
      <MiniAppFrame>
        <p className="text-sm text-muted-foreground">
          Open this page from the Snappy Telegram bot to use the Mini App.
        </p>
        <Link href="/" className="mt-6 text-sm text-primary underline">
          Go to Snappy web
        </Link>
      </MiniAppFrame>
    );
  }

  if (sessionView.status === "idle") {
    return <MiniAppFrame>{loadingBody()}</MiniAppFrame>;
  }

  if (sessionView.status === "error") {
    return (
      <MiniAppFrame>
        <p className="text-sm text-destructive">{sessionView.message}</p>
      </MiniAppFrame>
    );
  }

  const payload = sessionView.payload;

  if (payload.linked) {
    const usernameLabel = payload.telegramUsername
      ? `@${payload.telegramUsername}`
      : payload.snappyUserName;

    return (
      <MiniAppFrame subtitle="Telegram Mini App">
        <p className="text-sm text-muted-foreground">Connected as:</p>
        <p className="mt-1 font-medium text-foreground">{usernameLabel}</p>
        <div className="mt-10 w-full max-w-xs">
          <GlowButton
            type="button"
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            onClick={() => {
              const target = payload.snappyUrl?.replace(/\/$/, "") ?? "";
              openExternalLink(target ? `${target}/home` : "/home");
            }}
          >
            Open Snappy
          </GlowButton>
        </div>
      </MiniAppFrame>
    );
  }

  const unlinkedLabel = payload.telegramUsername
    ? `@${payload.telegramUsername}`
    : displayUsername
      ? `@${displayUsername}`
      : null;

  return (
    <MiniAppFrame>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your Telegram account isn&apos;t connected to Snappy yet.
      </p>
      <p className="mt-4 max-w-sm text-sm text-muted-foreground">
        Connect your Snappy account to continue.
      </p>
      {unlinkedLabel ? (
        <p className="mt-2 text-xs text-muted-foreground">{unlinkedLabel}</p>
      ) : null}
      <div className="mt-10 w-full max-w-xs">
        {payload.connectUrl ? (
          <GlowButton
            type="button"
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            onClick={() => openExternalLink(payload.connectUrl!)}
          >
            Connect Snappy
          </GlowButton>
        ) : (
          <p className="text-sm text-muted-foreground">
            Snappy URL is not configured. Ask an admin to set{" "}
            <code className="text-xs">SNAPPY_PUBLIC_URL</code>.
          </p>
        )}
      </div>
    </MiniAppFrame>
  );
}

function MiniAppFrame({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div
      className="flex min-h-[var(--tg-viewport-stable-height,100dvh)] flex-col px-4"
      style={{
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
      }}
    >
      <header className="text-center">
        <p className="text-3xl" aria-hidden>
          📸
        </p>
        <h1 className="mt-2 font-semibold text-2xl text-foreground tracking-tight">
          Snappy
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>
      <main className="mt-10 flex flex-1 flex-col items-center text-center">
        {children}
      </main>
    </div>
  );
}

function loadingBody() {
  return <p className="text-sm text-muted-foreground">Connecting…</p>;
}
