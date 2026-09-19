"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { ChatConversation } from "@/lib/chat-client";
import { ChatApiError } from "@/lib/chat-client";
import { Skeleton } from "@/components/ui/skeleton";

function formatRelativeTime(value: string | null): string {
  if (!value) return "";
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ChatListSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading conversations" aria-busy="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
      <p className="sr-only" aria-live="polite">Loading conversations…</p>
    </div>
  );
}

function ChatListEmpty({ prefix }: { prefix: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 10h8M8 14h5m7-2a8 8 0 11-16 0c0 1.35.335 2.622.926 3.736L4 20l4.264-1.926A8 8 0 0020 12z" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-foreground">No conversations yet</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
        Become friends with someone to start chatting.
      </p>
      <Link href={`${prefix}/search`} className="mt-5 inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring">
        Find friends
      </Link>
    </div>
  );
}

function ChatListError({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const message = error instanceof ChatApiError && error.status === 401
    ? "Your session has expired. Please reconnect."
    : "Could not load conversations.";
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground" role="alert">{message}</p>
      <button type="button" onClick={onRetry} className="mt-5 min-h-[44px] rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring">
        Try again
      </button>
    </div>
  );
}

export function ChatListItem({ conversation, prefix }: { conversation: ChatConversation; prefix: string }) {
  const participant = conversation.otherParticipant;
  if (!participant) return null;
  const unread = conversation.unreadCount > 0;
  return (
    <li>
      <Link
        href={`${prefix}/${encodeURIComponent(conversation.conversationId)}`}
        className={`flex min-h-[72px] items-center gap-3 rounded-xl border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${unread ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:bg-muted/50"}`}
        aria-label={`${participant.name}${unread ? `, ${conversation.unreadCount} unread messages` : ""}`}
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border">
          <Image src={participant.profileImage} alt="" fill sizes="48px" className="object-cover" />
        </div>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${unread ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
            {participant.name}
          </span>
          <span className={`mt-1 block truncate text-sm ${unread ? "text-foreground" : "text-muted-foreground"}`}>
            {conversation.lastMessage?.content ?? "No messages yet"}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
          <span>{formatRelativeTime(conversation.lastMessageAt)}</span>
          {unread ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-semibold text-primary-foreground">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span> : null}
          {!conversation.canMessage ? <span className="text-[10px]">Unavailable</span> : null}
        </span>
      </Link>
    </li>
  );
}

export default function ChatList({
  conversations,
  nextCursor,
  loading,
  loadingMore,
  error,
  onRetry,
  onLoadMore,
  prefix = "/chats",
}: {
  conversations: ChatConversation[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
  onRetry: () => void;
  onLoadMore: () => void;
  prefix?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!nextCursor || loadingMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "240px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadingMore, nextCursor, onLoadMore]);

  if (loading) return <ChatListSkeleton />;
  if (error) return <ChatListError error={error} onRetry={onRetry} />;
  if (conversations.length === 0) return <ChatListEmpty prefix={prefix.replace(/\/chats$/, "")} />;

  return (
    <>
      <ul className="space-y-2" aria-label="Conversations">
        {conversations.map((conversation) => (
          <ChatListItem key={conversation.conversationId} conversation={conversation} prefix={prefix} />
        ))}
      </ul>
      <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      {loadingMore ? <p className="py-4 text-center text-sm text-muted-foreground" aria-live="polite">Loading more conversations…</p> : null}
      {nextCursor && !loadingMore ? <button type="button" onClick={onLoadMore} className="mt-4 min-h-[44px] w-full rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Load more</button> : null}
    </>
  );
}
