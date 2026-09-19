import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAppUser } from "@/lib/auth";
import {
  CHAT_PAGE_SIZE,
  decodeConversationCursor,
  encodeConversationCursor,
  isValidChatId,
  normalizeUserPair,
  areUsersFriends,
} from "@/lib/chat";
import { prisma } from "@/lib/prisma";
import { isSocialMutationRateLimited } from "@/lib/social-rate-limit";

const createConversationSchema = z
  .object({ userId: z.string().min(1).max(64) })
  .strict();

function mutationKey(request: Request, userId: string): string {
  return `chat:${userId}:${request.headers.get("x-forwarded-for") ?? "unknown"}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002",
  );
}

function serializeParticipant(participant: {
  userId: string;
  user: { id: string; name: string; profileImage: string; isActive: boolean };
}) {
  return {
    id: participant.user.id,
    name: participant.user.name,
    profileImage: participant.user.profileImage,
  };
}

export async function GET(request: NextRequest) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawCursor = request.nextUrl.searchParams.get("cursor");
  const cursor = decodeConversationCursor(rawCursor);
  if (rawCursor && !cursor) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const rawLimit = request.nextUrl.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number(rawLimit) : CHAT_PAGE_SIZE;
  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 50)
    : CHAT_PAGE_SIZE;

  const conversations = await prisma.conversation.findMany({
    where: {
      participants: { some: { userId: viewer.id } },
      ...(cursor
        ? {
            OR: cursor.lastMessageAt
              ? [
                  { lastMessageAt: { lt: new Date(cursor.lastMessageAt) } },
                  {
                    lastMessageAt: new Date(cursor.lastMessageAt),
                    id: { lt: cursor.id },
                  },
                  { lastMessageAt: null },
                ]
              : [{ lastMessageAt: null, id: { lt: cursor.id } }],
          }
        : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      lastMessageAt: true,
      participants: {
        select: {
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
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          content: true,
          senderId: true,
          createdAt: true,
        },
      },
    },
  });

  const hasMore = conversations.length > limit;
  const page = hasMore ? conversations.slice(0, limit) : conversations;
  const visiblePage = page.filter((conversation) => {
    const other = conversation.participants.find(
      (participant) => participant.userId !== viewer.id,
    );
    return Boolean(other?.user.isActive);
  });

  const result = await Promise.all(
    visiblePage.map(async (conversation) => {
      const other = conversation.participants.find(
        (participant) => participant.userId !== viewer.id,
      );
      const viewerParticipant = conversation.participants.find(
        (participant) => participant.userId === viewer.id,
      );
      const unreadCount = viewerParticipant
        ? await prisma.message.count({
            where: {
              conversationId: conversation.id,
              senderId: { not: viewer.id },
              ...(viewerParticipant.lastReadAt
                ? { createdAt: { gt: viewerParticipant.lastReadAt } }
                : {}),
            },
          })
        : 0;

      return {
        conversationId: conversation.id,
        otherParticipant: other ? serializeParticipant(other) : null,
        lastMessage: conversation.messages[0]
          ? {
              id: conversation.messages[0].id,
              content: conversation.messages[0].content,
              senderId: conversation.messages[0].senderId,
              createdAt: conversation.messages[0].createdAt.toISOString(),
            }
          : null,
        lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
        unreadCount,
      };
    }),
  );

  const last = page[page.length - 1];
  return NextResponse.json({
    conversations: result,
    nextCursor:
      hasMore && last
        ? encodeConversationCursor({
            id: last.id,
            lastMessageAt: last.lastMessageAt?.toISOString() ?? null,
          })
        : null,
  });
}

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isSocialMutationRateLimited(mutationKey(request, viewer.id))) {
    return NextResponse.json(
      { error: "Too many chat requests. Please try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success || !isValidChatId(parsed.data.userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { id: parsed.data.userId, isActive: true },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!(await areUsersFriends(viewer.id, target.id))) {
    return NextResponse.json(
      { error: "You can only chat with a friend" },
      { status: 403 },
    );
  }

  const pair = normalizeUserPair(viewer.id, target.id);
  if (!pair) {
    return NextResponse.json({ error: "You cannot chat with yourself" }, { status: 400 });
  }

  let conversation;
  try {
    conversation = await prisma.conversation.upsert({
      where: {
        userLowId_userHighId: pair,
      },
      update: {},
      create: {
        ...pair,
        participants: {
          create: [{ userId: viewer.id }, { userId: target.id }],
        },
      },
      select: {
        id: true,
        userLowId: true,
        userHighId: true,
        participants: {
          select: {
            userId: true,
            user: { select: { id: true, name: true, profileImage: true, isActive: true } },
          },
        },
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      console.error("Conversation creation error:", error);
      return NextResponse.json(
        { error: "Could not create conversation" },
        { status: 500 },
      );
    }

    conversation = await prisma.conversation.findUnique({
      where: { userLowId_userHighId: pair },
      select: {
        id: true,
        userLowId: true,
        userHighId: true,
        participants: {
          select: {
            userId: true,
            user: { select: { id: true, name: true, profileImage: true, isActive: true } },
          },
        },
      },
    });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Could not create conversation" }, { status: 500 });
  }

  return NextResponse.json({
    conversationId: conversation.id,
    participants: conversation.participants.map(serializeParticipant),
  });
}
