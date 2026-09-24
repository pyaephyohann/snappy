"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import FriendsPickerPanel, {
  type FriendPickerUser,
} from "@/components/friends/FriendsPickerPanel";
import { readNextUserListCursor } from "@/lib/user-list";

interface FriendsSearchClientProps {
  friends: FriendPickerUser[];
  nextCursor?: string | null;
}

export default function FriendsSearchClient({
  friends,
  nextCursor: initialNextCursor = null,
}: FriendsSearchClientProps) {
  const router = useRouter();
  const [allFriends, setAllFriends] = useState(friends);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/users/list?cursor=${encodeURIComponent(nextCursor)}`,
        { credentials: "include" },
      );
      if (!response.ok) return;
      const data = (await response.json()) as FriendPickerUser[];
      setAllFriends((current) => {
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
      // Pagination is best-effort; the loaded page stays usable.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  return (
    <FriendsPickerPanel
      friends={allFriends}
      onSelect={(friend) => {
        router.push(`/friends/${encodeURIComponent(friend.name)}`);
      }}
      hasMore={Boolean(nextCursor)}
      loadingMore={loadingMore}
      onLoadMore={() => void loadMore()}
    />
  );
}
