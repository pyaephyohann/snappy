"use client";

import { useCallback, useEffect, useState } from "react";
import RecentSnapsSkeleton from "@/components/home/RecentSnapsSkeleton";
import TelegramSnapFeed from "@/components/telegram/TelegramSnapFeed";
import TelegramMiniAppReconnect from "@/components/telegram/TelegramMiniAppReconnect";
import { useTelegramMiniAppAuth } from "@/components/telegram/TelegramMiniAppAuthProvider";
import { GlowButton } from "@/components/ui/glow-button";
import type { PublicRecentSnap } from "@/lib/recent-snaps";

type HomeResponse = {
  snaps: PublicRecentSnap[];
  nextCursor: string | null;
  userName: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "session_expired" }
  | { status: "ready"; snaps: PublicRecentSnap[]; nextCursor: string | null; userName: string };

export default function TelegramMiniAppHome() {
  const { retryAuth } = useTelegramMiniAppAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);

  const loadHome = useCallback(async (cursor?: string | null) => {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await fetch(`/api/telegram/mini-app/home${query}`, {
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
      const body = await loadHome();
      setState({
        status: "ready",
        snaps: body.snaps,
        nextCursor: body.nextCursor,
        userName: body.userName,
      });
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

  const loadMore = async () => {
    if (state.status !== "ready" || !state.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const body = await loadHome(state.nextCursor);
      setState((current) =>
        current.status !== "ready"
          ? current
          : {
              ...current,
              snaps: [...current.snaps, ...body.snaps],
              nextCursor: body.nextCursor,
            },
      );
    } catch (error) {
      if (error instanceof Error && error.message === "session_expired") {
        setState({ status: "session_expired" });
        return;
      }
      throw error;
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="px-4 pb-4">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Home</h1>
        {state.status === "ready" ? (
          <p className="mt-1 text-sm text-muted-foreground">Hi, {state.userName}</p>
        ) : null}
      </header>

      {state.status === "loading" ? <RecentSnapsSkeleton /> : null}

      {state.status === "session_expired" ? (
        <TelegramMiniAppReconnect onReconnect={() => retryAuth()} />
      ) : null}

      {state.status === "error" ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-foreground">Could not load your Snaps.</p>
          <GlowButton
            type="button"
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => void reload()}
          >
            Try Again
          </GlowButton>
        </div>
      ) : null}

      {state.status === "ready" && state.snaps.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="font-medium text-foreground">No Snaps yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            New Snaps from your Snappy community will appear here.
          </p>
        </div>
      ) : null}

      {state.status === "ready" && state.snaps.length > 0 ? (
        <TelegramSnapFeed
          snaps={state.snaps}
          nextCursor={state.nextCursor}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
        />
      ) : null}
    </div>
  );
}
