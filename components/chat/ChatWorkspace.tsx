"use client";

import { useEffect, useState } from "react";
import { ChatApiError } from "@/lib/chat-client";
import { useConversationMessages } from "@/hooks/useConversationMessages";
import { useConversationReadState } from "@/hooks/useConversationReadState";
import ChatHeader from "@/components/chat/ChatHeader";
import FriendshipUnavailableState from "@/components/chat/FriendshipUnavailableState";
import MessageComposer from "@/components/chat/MessageComposer";
import MessageList from "@/components/chat/MessageList";

function ConversationError({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const message = error instanceof ChatApiError && error.status === 403
    ? "This conversation is not available."
    : error instanceof ChatApiError && error.status === 401
      ? "Your session has expired. Please reconnect."
      : "Could not load this conversation.";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted-foreground" role="alert">{message}</p>
      <button type="button" onClick={onRetry} className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring">Try again</button>
    </div>
  );
}

export default function ChatWorkspace({
  conversationId,
  viewerId,
  profilePrefix = "/friends",
  backHref = "/chats",
}: {
  conversationId: string;
  viewerId: string;
  profilePrefix?: string;
  backHref?: string;
}) {
  const {
    messages,
    nextCursor,
    loading,
    loadingOlder,
    sending,
    error,
    canMessage,
    otherParticipant,
    reload,
    loadOlder,
    sendMessage,
  } = useConversationMessages(conversationId);
  const { markRead } = useConversationReadState(conversationId, Boolean(otherParticipant));
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && otherParticipant) void markRead();
  }, [loading, markRead, messages.length, otherParticipant]);

  async function handleSend(content: string) {
    setSendError(null);
    const sent = await sendMessage(content);
    if (sent) {
      void markRead();
      return true;
    }
    setSendError("Could not send message. Please try again.");
    return false;
  }

  if (!otherParticipant && error) {
    return (
      <section className="flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background lg:min-h-[calc(100vh-10rem)]">
        <ConversationError error={error} onRetry={reload} />
      </section>
    );
  }

  if (!otherParticipant) {
    return <section className="flex min-h-[calc(100dvh-4rem)] items-center justify-center rounded-2xl border border-border bg-background text-sm text-muted-foreground">Loading conversation…</section>;
  }

  return (
    <section className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden rounded-none border-x border-border bg-background sm:rounded-2xl sm:border lg:h-[calc(100vh-10rem)]">
      <ChatHeader participant={otherParticipant} profilePrefix={profilePrefix} backHref={backHref} />
      {error && messages.length > 0 ? <p className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive" role="alert">{error.message}</p> : null}
      <MessageList messages={messages} viewerId={viewerId} loading={loading} loadingOlder={loadingOlder} nextCursor={nextCursor} onLoadOlder={loadOlder} />
      {sendError ? <p className="shrink-0 bg-destructive/10 px-4 py-2 text-xs text-destructive" role="alert">{sendError}</p> : null}
      {canMessage ? <MessageComposer disabled={false} sending={sending} onSend={handleSend} /> : <FriendshipUnavailableState />}
    </section>
  );
}
