import { prisma } from "@/lib/prisma";
import { getConversationAccess } from "@/lib/chat";

export const MESSAGE_REACTION_TYPES = ["❤️", "😂", "😮", "😢", "👍", "👎"] as const;
export type MessageReactionType = (typeof MESSAGE_REACTION_TYPES)[number];

export function isValidReactionType(value: unknown): value is MessageReactionType {
  return typeof value === "string" && (MESSAGE_REACTION_TYPES as readonly string[]).includes(value);
}

export type MessageReactionSummary = {
  type: string;
  count: number;
};

export type MessageWithReactions = {
  id: string;
  content: string;
  senderId: string;
  sender: { id: string; name: string; profileImage: string };
  createdAt: string;
  reactions: MessageReactionSummary[];
  myReaction: string | null;
};

/**
 * Verify the viewer can access the conversation and that the message belongs to it.
 * Returns the message record if valid, null otherwise.
 */
async function verifyMessageAccess(
  viewerId: string,
  conversationId: string,
  messageId: string,
): Promise<{ id: string; conversationId: string } | null> {
  const access = await getConversationAccess(viewerId, conversationId);
  if (!access) return null;

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { id: true, conversationId: true },
  });

  return message ?? null;
}

/**
 * Toggle or replace a reaction.
 * - No existing reaction → create.
 * - Same type exists → remove (toggle off).
 * - Different type exists → replace.
 */
export async function toggleReaction(
  viewerId: string,
  conversationId: string,
  messageId: string,
  reactionType: MessageReactionType,
): Promise<{ action: "created" | "removed" | "replaced"; myReaction: string | null }> {
  const message = await verifyMessageAccess(viewerId, conversationId, messageId);
  if (!message) {
    throw new ReactionError("Message not found", 404);
  }

  const existing = await prisma.messageReaction.findUnique({
    where: { userId_messageId: { userId: viewerId, messageId } },
    select: { id: true, type: true },
  });

  if (existing) {
    if (existing.type === reactionType) {
      // Toggle off: remove existing reaction
      await prisma.messageReaction.delete({ where: { id: existing.id } });
      return { action: "removed", myReaction: null };
    }
    // Replace: delete old, create new
    await prisma.messageReaction.delete({ where: { id: existing.id } });
    await prisma.messageReaction.create({
      data: { userId: viewerId, messageId, type: reactionType },
    });
    return { action: "replaced", myReaction: reactionType };
  }

  // Create new reaction
  await prisma.messageReaction.create({
    data: { userId: viewerId, messageId, type: reactionType },
  });
  return { action: "created", myReaction: reactionType };
}

/**
 * Get reaction summaries and viewer's reaction for a set of message IDs.
 */
export async function removeReaction(
  viewerId: string,
  conversationId: string,
  messageId: string,
): Promise<number> {
  const message = await verifyMessageAccess(viewerId, conversationId, messageId);
  if (!message) {
    throw new ReactionError("Message not found", 404);
  }

  const deleted = await prisma.messageReaction.deleteMany({
    where: { userId: viewerId, messageId },
  });
  return deleted.count;
}

export async function getReactionsForMessages(
  messageIds: string[],
  viewerId: string,
): Promise<
  Map<string, { reactions: MessageReactionSummary[]; myReaction: string | null }>
> {
  const result = new Map<
    string,
    { reactions: MessageReactionSummary[]; myReaction: string | null }
  >();

  if (messageIds.length === 0) return result;

  // Initialize all messages with empty reactions
  for (const id of messageIds) {
    result.set(id, { reactions: [], myReaction: null });
  }

  const rows = await prisma.messageReaction.findMany({
    where: { messageId: { in: messageIds } },
    select: { messageId: true, type: true, userId: true },
  });

  // Aggregate counts by type per message
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!counts.has(row.messageId)) counts.set(row.messageId, new Map());
    const typeCounts = counts.get(row.messageId)!;
    typeCounts.set(row.type, (typeCounts.get(row.type) ?? 0) + 1);
  }

  // Build summaries and detect viewer's reaction
  for (const [messageId, typeCounts] of counts) {
    const reactions: MessageReactionSummary[] = [];
    for (const [type, count] of typeCounts) {
      reactions.push({ type, count });
    }
    reactions.sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

    const viewerRow = rows.find(
      (r) => r.messageId === messageId && r.userId === viewerId,
    );

    result.set(messageId, {
      reactions,
      myReaction: viewerRow?.type ?? null,
    });
  }

  return result;
}

export class ReactionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ReactionError";
    this.status = status;
  }
}
