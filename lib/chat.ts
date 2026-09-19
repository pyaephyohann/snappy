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
