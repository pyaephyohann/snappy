export type RelationshipState = {
  isFollowing: boolean;
  isFollowedBy: boolean;
  isFriend: boolean;
};

export function relationshipStateFromFlags(
  isFollowing: boolean,
  isFollowedBy: boolean,
): RelationshipState {
  return {
    isFollowing,
    isFollowedBy,
    isFriend: isFollowing && isFollowedBy,
  };
}
