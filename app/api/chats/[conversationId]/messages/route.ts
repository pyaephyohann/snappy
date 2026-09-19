import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import {
  canUseConversation,
  decodeMessageCursor,
  encodeMessageCursor,
  isValidChatId,
  validateMessageContent,
} from "@/lib/chat";
import { prisma } from "@/lib/prisma";
import { isSocialMutationRateLimited } from "@/lib/social-rate-limit";

function mutationKey(request: Request, userId: string): string {
  return `chat-message:${userId}:${request.headers.get("x-forwarded-for") ?? "unknown"}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;
  if (!isValidChatId(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  const access = await canUseConversation(viewer.id, conversationId);
  if (!access) {
    return NextResponse.json(
      { error: "Conversation not available" },
      { status: 403 },
    );
  }

  const rawCursor = request.nextUrl.searchParams.get("cursor");
  const cursor = decodeMessageCursor(rawCursor);
  if (rawCursor && !cursor) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const rawLimit = request.nextUrl.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number(rawLimit) : 20;
  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 50)
    : 20;

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      content: true,
      senderId: true,
      createdAt: true,
      sender: { select: { id: true, name: true, profileImage: true } },
    },
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const chronological = [...page].reverse();
  const oldest = page[page.length - 1];

  return NextResponse.json({
    messages: chronological.map((message) => ({
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      sender: message.sender,
      createdAt: message.createdAt.toISOString(),
    })),
    nextCursor:
      hasMore && oldest
        ? encodeMessageCursor({
            id: oldest.id,
            createdAt: oldest.createdAt.toISOString(),
          })
        : null,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isSocialMutationRateLimited(mutationKey(request, viewer.id))) {
    return NextResponse.json(
      { error: "Too many messages. Please try again later." },
      { status: 429 },
    );
  }

  const { conversationId } = await params;
  if (!isValidChatId(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  const access = await canUseConversation(viewer.id, conversationId);
  if (!access) {
    return NextResponse.json(
      { error: "Conversation not available" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contentResult =
    body && typeof body === "object" && "content" in body
      ? validateMessageContent((body as { content?: unknown }).content)
      : { ok: false as const, error: "Message content is required" };
  if (!contentResult.ok) {
    return NextResponse.json({ error: contentResult.error }, { status: 400 });
  }

  const created = await prisma.$transaction(async (transaction) => {
    const message = await transaction.message.create({
      data: {
        conversationId,
        senderId: viewer.id,
        content: contentResult.content,
      },
      select: {
        id: true,
        content: true,
        senderId: true,
        createdAt: true,
        sender: { select: { id: true, name: true, profileImage: true } },
      },
    });

    await transaction.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });

    return message;
  });

  return NextResponse.json({
    message: {
      id: created.id,
      content: created.content,
      senderId: created.senderId,
      sender: created.sender,
      createdAt: created.createdAt.toISOString(),
    },
  });
}
