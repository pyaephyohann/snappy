"use client";

import { useRouter } from "next/navigation";
import FriendsPickerPanel, {
  type FriendPickerUser,
} from "@/components/friends/FriendsPickerPanel";

interface FriendsSearchClientProps {
  friends: FriendPickerUser[];
}

export default function FriendsSearchClient({
  friends,
}: FriendsSearchClientProps) {
  const router = useRouter();

  return (
    <FriendsPickerPanel
      friends={friends}
      onSelect={(friend) => {
        router.push(`/friends/${encodeURIComponent(friend.name)}`);
      }}
    />
  );
}
