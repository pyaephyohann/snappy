import { notFound, redirect } from "next/navigation";
import ChatWorkspace from "@/components/chat/ChatWorkspace";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { isValidChatId } from "@/lib/chat-validation";

export default async function TelegramChatConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const user = await getAuthenticatedAppUser();
  if (!user) redirect("/telegram/app");
  const { conversationId } = await params;
  if (!isValidChatId(conversationId)) notFound();

  return (
    <div className="px-0 pb-0">
      <ChatWorkspace
        conversationId={conversationId}
        viewerId={user.id}
        profilePrefix="/telegram/app/friends"
        backHref="/telegram/app/chats"
      />
    </div>
  );
}
