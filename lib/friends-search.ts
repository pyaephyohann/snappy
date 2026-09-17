import type { FriendPickerUser } from "@/components/friends/FriendsPickerPanel";

export type FriendNameMatch = {
  id: string;
  name: string;
};

export function matchFriendsByNamePartial(
  friends: FriendNameMatch[],
  rawQuery: string,
): FriendNameMatch[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return [];
  }

  const exact = friends.filter(
    (friend) => friend.name.toLowerCase() === query,
  );
  if (exact.length === 1) {
    return exact;
  }

  return friends.filter((friend) =>
    friend.name.toLowerCase().includes(query),
  );
}

export function filterFriendsByQuery(
  friends: FriendPickerUser[],
  query: string,
): FriendPickerUser[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return friends;
  }
  return friends.filter((friend) =>
    friend.name.toLowerCase().includes(normalized),
  );
}

export function detectMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const uaData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform =
    uaData.userAgentData?.platform ?? navigator.platform ?? "";
  return /mac/i.test(platform);
}
