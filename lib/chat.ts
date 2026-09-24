import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRelationshipState } from "@/lib/relationships";

export {
  CHAT_PAGE_SIZE,
  decodeConversationCursor,
  decodeMessageCursor,
  encodeConversationCursor,
  encodeMessageCursor,
  isValidChatId,
  normalizeUserPair,
  validateMessageContent,
} from "@/lib/chat-validation";

export type {
  ConversationCursor,
  MessageCursor,
} from "@/lib/chat-validation";

export type ChatParticipant = {
  id: string;
  name: string;
  profileImage: string;
  isActive: boolean;
};

/**
 * Unread counts for a page of conversations in a single round trip.
 *
 * Semantics are identical to counting messages per conversation: a message
 * counts when its sender is not the viewer and either the viewer has never read
 * the conversation or the message is newer than the viewer's `lastReadAt`.
 * Aggregating in the database avoids one `count()` query per conversation when
 * the chat list is polled every 15 seconds.
 */
export async function getUnreadCountsForConversations(
  viewerId: string,
  conversationIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map(conversationIds.map((id) => [id, 0]));
  if (conversationIds.length === 0) {
    return counts;
  }

  const rows = await prisma.$queryRaw<
    Array<{ conversationId: string; count: bigint }>
  >`
    SELECT m."conversationId" AS "conversationId", COUNT(*) AS count
    FROM "messages" m
    JOIN "conversation_participants" p
      ON p."conversationId" = m."conversationId"
     AND p."userId" = ${viewerId}
    WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
      AND m."senderId" <> ${viewerId}
      AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
    GROUP BY m."conversationId"
  `;

  for (const row of rows) {
    counts.set(row.conversationId, Number(row.count));
  }

  return counts;
}

export async function areUsersFriends(
  viewerId: string,
  targetUserId: string,
): Promise<boolean> {
  const relationship = await getRelationshipState(viewerId, targetUserId);
  return relationship.isFriend;
}

export async function getConversationAccess(
  viewerId: string,
  conversationId: string,
) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      participants: { some: { userId: viewerId } },
    },
    select: {
      id: true,
      userLowId: true,
      userHighId: true,
      participants: {
        select: {
          id: true,
          userId: true,
          lastReadAt: true,
          user: {
            select: {
              id: true,
              name: true,
              profileImage: true,
              isActive: true,
              lastSeenAt: true,
            },
          },
        },
      },
    },
  });

  if (!conversation) return null;

  const viewerParticipant = conversation.participants.find(
    (participant) => participant.userId === viewerId,
  );
  const otherParticipant = conversation.participants.find(
    (participant) => participant.userId !== viewerId,
  );

  if (!viewerParticipant || !otherParticipant) {
    return null;
  }

  return { conversation, viewerParticipant, otherParticipant };
}

export async function canUseConversation(
  viewerId: string,
  conversationId: string,
) {
  const access = await getConversationAccess(viewerId, conversationId);
  if (!access || !access.otherParticipant.user.isActive) {
    return null;
  }

  if (!(await areUsersFriends(viewerId, access.otherParticipant.userId))) {
    return null;
  }

  return access;
}
