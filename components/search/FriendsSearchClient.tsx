"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface FriendResult {
  id: string;
  name: string;
  profileImage: string;
}

interface FriendsSearchClientProps {
  friends: FriendResult[];
}

export default function FriendsSearchClient({
  friends,
}: FriendsSearchClientProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return friends;
    return friends.filter((friend) =>
      friend.name.toLowerCase().includes(normalized),
    );
  }, [friends, query]);

  return (
    <div className="space-y-6">
      <label className="block">
        <span className="sr-only">Search friends</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search friends by name"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No friends match your search.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {filtered.map((friend) => (
            <li key={friend.id}>
              <Link
                href={`/friends/${encodeURIComponent(friend.name)}`}
                className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
