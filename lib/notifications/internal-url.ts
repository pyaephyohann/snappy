/**
 * Validates in-app navigation targets for notifications and push payloads.
 * Rejects external URLs and malformed paths.
 */
export function isValidInternalNotificationUrl(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }
  if (path.includes("://")) {
    return false;
  }
  if (path === "/home" || path.startsWith("/home/")) {
    return true;
  }
  if (path === "/search" || path.startsWith("/search/")) {
    return true;
  }
  if (path === "/notifications" || path.startsWith("/notifications/")) {
    return true;
  }
  if (path.startsWith("/chats/")) {
    const conversationId = path.slice("/chats/".length).split("/")[0];
    return conversationId.length > 0 && !conversationId.includes("..");
  }
  if (path.startsWith("/telegram/app/chats/")) {
    const conversationId = path.slice("/telegram/app/chats/".length).split("/")[0];
    return conversationId.length > 0 && !conversationId.includes("..");
  }
  if (path.startsWith("/friends/")) {
    const slug = path.slice("/friends/".length).split("/")[0];
    return slug.length > 0 && !slug.includes("..");
  }
  return false;
}

export function buildFriendProfileUrl(friendName: string): string {
  return `/friends/${encodeURIComponent(friendName)}`;
}

export function sanitizeNotificationUrl(path: string): string | null {
  const normalized = path.trim();
  if (!isValidInternalNotificationUrl(normalized)) {
    return null;
  }
  return normalized;
}
