import { prisma } from "@/lib/prisma";

/**
 * Server-authoritative unread notification count for one user.
 *
 * Unread is `Notification.readAt IS NULL`. This is the single counting path
 * behind `GET /api/notifications/unread-count`: a database-side count on the
 * existing `(userId, readAt)` index, with no joins and no notification
 * content loaded. It is intentionally independent of chat conversation read
 * state.
 */
export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}
