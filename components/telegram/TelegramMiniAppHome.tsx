"use client";

import { useCallback, useEffect, useState } from "react";
import HomeContent from "@/components/home/HomeContent";
import RecentSnapsSkeleton from "@/components/home/RecentSnapsSkeleton";
import TelegramMiniAppReconnect from "@/components/telegram/TelegramMiniAppReconnect";
import { useTelegramMiniAppAuth } from "@/components/telegram/TelegramMiniAppAuthProvider";
import { GlowButton } from "@/components/ui/glow-button";
import type { HomeData } from "@/lib/home-data";

type HomeResponse = HomeData & {
  userName: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "session_expired" }
  | { status: "ready"; data: HomeResponse };

export default function TelegramMiniAppHome() {
  const { retryAuth } = useTelegramMiniAppAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadHome = useCallback(async () => {
    const response = await fetch("/api/telegram/mini-app/home", {
      credentials: "include",
    });
    if (response.status === 401) {
      throw new Error("session_expired");
    }
    if (!response.ok) {
      throw new Error("request_failed");
    }
    return (await response.json()) as HomeResponse;
  }, []);

  const reload = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await loadHome();
      setState({ status: "ready", data });
    } catch (error) {
      setState({
        status: error instanceof Error && error.message === "session_expired"
          ? "session_expired"
          : "error",
      });
    }
  }, [loadHome]);

  useEffect(() => {
    queueMicrotask(() => {
      void reload();
    });
  }, [reload]);

  return (
    <>
      {state.status === "loading" ? <RecentSnapsSkeleton /> : null}

      {state.status === "session_expired" ? (
        <TelegramMiniAppReconnect onReconnect={() => retryAuth()} />
      ) : null}

      {state.status === "error" ? (
        <div className="px-4 py-8">
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-foreground">Could not load Home.</p>
            <GlowButton
              type="button"
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
              onClick={() => void reload()}
            >
              Try Again
            </GlowButton>
          </div>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <HomeContent
          username={state.data.userName}
          profileImage={state.data.profileImage}
          heroCarousel={state.data.heroCarousel}
          friends={state.data.friends}
          snaps={state.data.snaps}
          friendPathPrefix="/telegram/app/friends"
          showViewAllLink={false}
        />
      ) : null}
    </>
  );
}
