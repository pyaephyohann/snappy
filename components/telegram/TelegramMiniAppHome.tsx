"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import RecentSnaps from "@/components/home/RecentSnaps";
import RecentSnapsSkeleton from "@/components/home/RecentSnapsSkeleton";
import TelegramOpenBotLink from "@/components/telegram/TelegramOpenBotLink";
import TelegramMiniAppReconnect from "@/components/telegram/TelegramMiniAppReconnect";
import { useTelegramMiniAppAuth } from "@/components/telegram/TelegramMiniAppAuthProvider";
import { GlowButton } from "@/components/ui/glow-button";
import type { PublicRecentSnap } from "@/lib/recent-snaps";
import { TELEGRAM_MINI_APP_ROUTES } from "@/lib/telegram/mini-app-routes";

type HomeResponse = {
  snaps: PublicRecentSnap[] | null;
  userName: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "session_expired" }
  | { status: "ready"; snaps: PublicRecentSnap[] | null; userName: string };

export default function TelegramMiniAppHome() {
  const { retryAuth } = useTelegramMiniAppAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadHome = useCallback(async (options?: { showLoading?: boolean }) => {
    if (options?.showLoading) {
      setState({ status: "loading" });
    }
    try {
      const response = await fetch("/api/telegram/mini-app/home", {
        credentials: "include",
      });
      if (response.status === 401) {
        setState({ status: "session_expired" });
        return;
      }
      if (!response.ok) {
        setState({ status: "error" });
        return;
      }
      const body = (await response.json()) as HomeResponse;
      setState({
        status: "ready",
        snaps: body.snaps,
        userName: body.userName,
      });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/telegram/mini-app/home", {
          credentials: "include",
        });
        if (cancelled) {
          return;
        }
        if (response.status === 401) {
          setState({ status: "session_expired" });
          return;
        }
        if (!response.ok) {
          setState({ status: "error" });
          return;
        }
        const body = (await response.json()) as HomeResponse;
        setState({
          status: "ready",
          snaps: body.snaps,
          userName: body.userName,
        });
      } catch {
        if (!cancelled) {
          setState({ status: "error" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="px-4 pb-4">
      <header className="mb-6">
        <p className="text-2xl" aria-hidden>
          📸
        </p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Snappy</h1>
        {state.status === "ready" ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Hi, {state.userName}
          </p>
        ) : null}
      </header>

      <nav
        className="mb-6 grid grid-cols-3 gap-2"
        aria-label="Quick actions"
      >
        <MiniAppQuickAction href={TELEGRAM_MINI_APP_ROUTES.find} label="Find Snap" emoji="🔍" />
        <MiniAppQuickAction href={TELEGRAM_MINI_APP_ROUTES.upload} label="Upload" emoji="📤" />
        <MiniAppQuickAction href={TELEGRAM_MINI_APP_ROUTES.profile} label="Profile" emoji="👤" />
      </nav>

      <div className="mb-6 text-center">
        <TelegramOpenBotLink label="Open Snappy Bot" />
      </div>

      {state.status === "loading" ? <RecentSnapsSkeleton /> : null}

      {state.status === "session_expired" ? (
        <TelegramMiniAppReconnect onReconnect={() => retryAuth()} />
      ) : null}

      {state.status === "error" ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-foreground">Something went wrong.</p>
          <GlowButton
            type="button"
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => void loadHome({ showLoading: true })}
          >
            Try Again
          </GlowButton>
        </div>
      ) : null}

      {state.status === "ready" && state.snaps && state.snaps.length > 0 ? (
        <RecentSnaps snaps={state.snaps} showViewAllLink={false} />
      ) : null}

      {state.status === "ready" && (!state.snaps || state.snaps.length === 0) ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-2xl" aria-hidden>
            📸
          </p>
          <p className="mt-3 font-medium text-foreground">No Snaps yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your Snappy feed will appear here.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function MiniAppQuickAction({
  href,
  label,
  emoji,
}: {
  href: string;
  label: string;
  emoji: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center rounded-xl border border-border bg-card px-2 py-3 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      <span className="text-lg" aria-hidden>
        {emoji}
      </span>
      <span className="mt-1">{label}</span>
    </Link>
  );
}
