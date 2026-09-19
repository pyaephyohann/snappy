"use client";

import ChatList from "@/components/chat/ChatList";
import { useChatList } from "@/hooks/useChatList";

export default function ChatListPageClient({ prefix = "/chats" }: { prefix?: string }) {
  const state = useChatList();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Chats</h1>
          <p className="mt-1 text-sm text-muted-foreground">Messages with your friends.</p>
        </div>
      </div>
      <ChatList
        conversations={state.conversations}
        nextCursor={state.nextCursor}
        loading={state.loading}
        loadingMore={state.loadingMore}
        error={state.error}
        onRetry={state.reload}
        onLoadMore={state.loadMore}
        prefix={prefix}
      />
    </div>
  );
}
