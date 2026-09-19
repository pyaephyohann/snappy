export default function FriendshipUnavailableState() {
  return (
    <div className="shrink-0 border-t border-border bg-card px-4 py-4 text-center sm:px-5" role="status">
      <p className="text-sm font-medium text-foreground">Messaging unavailable</p>
      <p className="mt-1 text-xs text-muted-foreground">
        You can read this conversation, but messaging requires mutual friendship.
      </p>
    </div>
  );
}
