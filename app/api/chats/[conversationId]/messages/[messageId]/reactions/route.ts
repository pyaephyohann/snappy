import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { isValidChatId } from "@/lib/chat";
import {
  toggleReaction,
  removeReaction,
  isValidReactionType,
  ReactionError,
} from "@/lib/message-reactions";
import { isSocialMutationRateLimited } from "@/lib/social-rate-limit";

function mutationKey(userId: string, messageId: string): string {
  return `reaction:${userId}:${messageId}`;
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ conversationId: string; messageId: string }>;
  },
) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId, messageId } = await params;
  if (!isValidChatId(conversationId) || !isValidChatId(messageId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  if (isSocialMutationRateLimited(mutationKey(viewer.id, messageId))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reactionType =
    body && typeof body === "object" && "type" in body
      ? (body as { type?: unknown }).type
      : undefined;

  if (!isValidReactionType(reactionType)) {
    return NextResponse.json(
      { error: "Invalid reaction type" },
      { status: 400 },
    );
  }

  try {
    const result = await toggleReaction(
      viewer.id,
      conversationId,
      messageId,
      reactionType,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReactionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ conversationId: string; messageId: string }>;
  },
) {
  const viewer = await getAuthenticatedAppUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId, messageId } = await params;
  if (!isValidChatId(conversationId) || !isValidChatId(messageId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const deleted = await removeReaction(viewer.id, conversationId, messageId);
    return NextResponse.json({
      action: "removed",
      myReaction: null,
      deleted,
    });
  } catch (error) {
    if (error instanceof ReactionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
