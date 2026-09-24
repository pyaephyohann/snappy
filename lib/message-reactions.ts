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

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}

function isRecordNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2025",
  );
}

/**
 * Toggle or replace a reaction.
 * - No existing reaction → create.
 * - Same type exists → remove (toggle off).
 * - Different type exists → replace.
 *
 * Every mutation is idempotent so concurrent requests (double taps, two devices,
 * polling reconciliation) cannot produce a 5xx or a duplicate row:
 * - toggle-off uses `deleteMany`, which is a no-op when a concurrent request
 *   already removed the row instead of raising P2025;
 * - create/replace uses a single atomic `upsert` on the `(userId, messageId)`
 *   unique key instead of delete-then-create, and a lost race is retried once.
 * The invariant "at most one reaction per (userId, messageId)" is enforced by
 * the database unique constraint, not by the read that precedes the write.
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

  if (existing && existing.type === reactionType) {
    // Toggle off. deleteMany cannot fail when the row is already gone.
    await prisma.messageReaction.deleteMany({
      where: { userId: viewerId, messageId },
    });
    return { action: "removed", myReaction: null };
  }

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await prisma.messageReaction.upsert({
        where: { userId_messageId: { userId: viewerId, messageId } },
        create: { userId: viewerId, messageId, type: reactionType },
        update: { type: reactionType },
      });
      break;
    } catch (error) {
      const lostRace =
        isUniqueConstraintError(error) || isRecordNotFoundError(error);
      if (!lostRace) {
        throw error;
      }
      if (attempt === MAX_ATTEMPTS) {
        // The unique constraint already guarantees at most one row, so a final
        // race loss is not a request failure: the read-back below reports the
        // persisted state and the client reconciles on the next poll.
        break;
      }
    }
  }

  // Report what is actually persisted rather than assuming the write landed.
  const persisted = await prisma.messageReaction.findUnique({
    where: { userId_messageId: { userId: viewerId, messageId } },
    select: { type: true },
  });
  const myReaction = persisted?.type ?? null;

  if (existing) {
    return { action: "replaced", myReaction };
  }
  return { action: "created", myReaction };
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
