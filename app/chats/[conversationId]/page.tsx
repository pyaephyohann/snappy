import { notFound, redirect } from "next/navigation";
import ChatWorkspace from "@/components/chat/ChatWorkspace";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { isValidChatId } from "@/lib/chat-validation";

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const user = await getAuthenticatedAppUser();
  if (!user) redirect("/");
  const { conversationId } = await params;
  if (!isValidChatId(conversationId)) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-0 py-0 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <ChatWorkspace conversationId={conversationId} viewerId={user.id} />
    </main>
  );
}
