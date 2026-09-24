"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FriendsPickerPanel, {
  type FriendPickerUser,
} from "@/components/friends/FriendsPickerPanel";
import TelegramMiniAppReconnect from "@/components/telegram/TelegramMiniAppReconnect";
import { useTelegramMiniAppAuth } from "@/components/telegram/TelegramMiniAppAuthProvider";
import { TELEGRAM_MINI_APP_ROUTES } from "@/lib/telegram/mini-app-routes";
import { readNextUserListCursor } from "@/lib/user-list";

export default function TelegramMiniAppSearch() {
  const router = useRouter();
  const { retryAuth } = useTelegramMiniAppAuth();
  const [friends, setFriends] = useState<FriendPickerUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "expired">("loading");

  const loadFriends = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/users/list", { credentials: "include" });
      if (response.status === 401) {
        setStatus("expired");
        return;
      }
      if (!response.ok) throw new Error("request_failed");
      setFriends((await response.json()) as FriendPickerUser[]);
      setNextCursor(readNextUserListCursor(response));
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

  const loadMoreFriends = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/users/list?cursor=${encodeURIComponent(nextCursor)}`,
        { credentials: "include" },
      );
      if (!response.ok) return;
      const data = (await response.json()) as FriendPickerUser[];
      setFriends((current) => {
        const seen = new Set(current.map((friend) => friend.id));
        return [
          ...current,
          ...data.filter((friend) => {
            if (seen.has(friend.id)) return false;
            seen.add(friend.id);
            return true;
          }),
        ];
      });
      setNextCursor(readNextUserListCursor(response));
    } catch {
      // Pagination is best-effort; the current page stays usable.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  if (status === "expired") {
    return <div className="px-4 pt-10"><TelegramMiniAppReconnect onReconnect={() => retryAuth()} /></div>;
  }

  return (
    <div className="px-4 pb-6">
      <h1 className="mb-2 text-xl font-semibold text-foreground">Search</h1>
      <p className="mb-6 text-sm text-muted-foreground">Find a friend and view their Snaps.</p>
      {status === "loading" ? (
        <p className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Loading friends…</p>
      ) : status === "error" ? (
        <div className="rounded-xl border border-border bg-card px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">Could not load friends.</p>
          <button type="button" className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={() => void loadFriends()}>Try Again</button>
        </div>
      ) : (
        <FriendsPickerPanel
          friends={friends}
          onSelect={(friend) => router.push(`${TELEGRAM_MINI_APP_ROUTES.home}/friends/${encodeURIComponent(friend.name)}`)}
          emptyMessage="No friends match your search."
          hasMore={Boolean(nextCursor)}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMoreFriends()}
        />
      )}
      <button type="button" className="mt-6 text-sm text-primary underline" onClick={() => router.push(TELEGRAM_MINI_APP_ROUTES.home)}>
        Back to Home
      </button>
    </div>
  );
}
