"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { filterFriendsByQuery } from "@/lib/friends-search";
import type { RelationshipState } from "@/lib/relationships";

export interface FriendPickerUser {
  id: string;
  name: string;
  profileImage: string;
  relationship?: RelationshipState;
}

interface FriendsPickerPanelProps {
  friends: FriendPickerUser[];
  onSelect: (friend: FriendPickerUser) => void;
  emptyMessage?: string;
  /** True when the server has more users beyond the loaded page. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

export default function FriendsPickerPanel({
  friends,
  onSelect,
  emptyMessage = "No friends match your search.",
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: FriendsPickerPanelProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => filterFriendsByQuery(friends, query),
    [friends, query],
  );

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="sr-only">Search friends</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search friends by name"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <ul className="max-h-[min(50vh,20rem)] divide-y divide-border overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card">
          {filtered.map((friend) => (
            <li key={friend.id}>
              <button
                type="button"
                onClick={() => onSelect(friend)}
                className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border">
                  <Image
                    src={friend.profileImage}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                </div>
                <span className="min-w-0 flex-1 font-medium text-foreground">{friend.name}</span>
                {friend.relationship?.isFriend ? (
                  <span className="shrink-0 text-xs font-medium text-primary">Friend</span>
                ) : friend.relationship?.isFollowing ? (
                  <span className="shrink-0 text-xs text-muted-foreground">Following</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasMore && onLoadMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="min-h-[44px] w-full rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {loadingMore ? "Loading more…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
