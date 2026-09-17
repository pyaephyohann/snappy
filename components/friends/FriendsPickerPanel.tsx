"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { filterFriendsByQuery } from "@/lib/friends-search";

export interface FriendPickerUser {
  id: string;
  name: string;
  profileImage: string;
}

interface FriendsPickerPanelProps {
  friends: FriendPickerUser[];
  onSelect: (friend: FriendPickerUser) => void;
  emptyMessage?: string;
}

export default function FriendsPickerPanel({
  friends,
  onSelect,
  emptyMessage = "No friends match your search.",
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
                <span className="font-medium text-foreground">{friend.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
