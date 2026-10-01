"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FriendCard from "@/components/home/FriendCard";
import TelegramMiniAppReconnect from "@/components/telegram/TelegramMiniAppReconnect";
import { useTelegramMiniAppAuth } from "@/components/telegram/TelegramMiniAppAuthProvider";
import { GlowButton } from "@/components/ui/glow-button";
import { TELEGRAM_MINI_APP_ROUTES } from "@/lib/telegram/mini-app-routes";
import type { RelationshipUser } from "@/lib/relationships";

export default function TelegramMiniAppFriends() {
  const router = useRouter();
  const { retryAuth } = useTelegramMiniAppAuth();
  const [friends, setFriends] = useState<RelationshipUser[]>([]);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "expired"
  >("loading");

  const loadFriends = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/friends", { credentials: "include" });
      if (response.status === 401) {
        setStatus("expired");
        return;
      }
      if (!response.ok) throw new Error("request_failed");
      const data = (await response.json()) as { users: RelationshipUser[] };
      setFriends(data.users);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadFriends();
    });
  }, [loadFriends]);

  if (status === "expired") {
    return (
      <div className="px-4 pt-10">
        <TelegramMiniAppReconnect onReconnect={() => retryAuth()} />
      </div>
    );
  }

  return (
    <div className="px-4 pb-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Friends</h1>
        <button
          type="button"
          className="shrink-0 text-sm font-medium text-primary"
          onClick={() =>
            router.push(`${TELEGRAM_MINI_APP_ROUTES.home}/search`)
          }
        >
          Find friends →
        </button>
      </div>

      {status === "loading" ? (
        <p className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Loading friends…
        </p>
      ) : status === "error" ? (
        <div className="rounded-xl border border-border bg-card px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">Could not load friends.</p>
          <GlowButton
            type="button"
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => void loadFriends()}
          >
            Try Again
          </GlowButton>
        </div>
      ) : friends.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-10 text-center">
          <p className="text-3xl" aria-hidden>
            👥
          </p>
          <p className="mt-2 font-semibold text-foreground">No friends yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You are friends with someone once you follow each other.
          </p>
          <GlowButton
            type="button"
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() =>
              router.push(`${TELEGRAM_MINI_APP_ROUTES.home}/search`)
            }
          >
            Find friends
          </GlowButton>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {friends.map((friend) => (
            <FriendCard
              key={friend.id}
              name={friend.name}
              profileImage={friend.profileImage}
              profilePathPrefix={TELEGRAM_MINI_APP_ROUTES.home}
            />
          ))}
        </div>
      )}
    </div>
  );
}
