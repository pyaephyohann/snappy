import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { getConversationAccess, isValidChatId } from "@/lib/chat";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _request: Request,
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

  const access = await getConversationAccess(viewer.id, conversationId);
  if (!access) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const readAt = new Date();
  await prisma.conversationParticipant.update({
    where: { id: access.viewerParticipant.id },
    data: { lastReadAt: readAt },
  });

  return NextResponse.json({
    conversationId,
    readAt: readAt.toISOString(),
  });
}
