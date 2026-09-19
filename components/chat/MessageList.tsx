"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/chat-client";

function dayKey(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function MessageBubble({ message, own }: { message: ChatMessage; own: boolean }) {
  return (
    <li className={`flex items-end gap-2 ${own ? "justify-end" : "justify-start"}`}>
      {!own ? (
        <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border">
          <Image src={message.sender.profileImage} alt="" fill sizes="28px" className="object-cover" />
        </div>
      ) : null}
      <div className={`max-w-[82%] sm:max-w-[70%] ${own ? "items-end" : "items-start"}`}>
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-5 shadow-sm ${own ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card text-foreground"}`}>
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <time dateTime={message.createdAt} className={`mt-1 block px-1 text-[10px] text-muted-foreground ${own ? "text-right" : "text-left"}`}>
          {formatTime(message.createdAt)}
        </time>
      </div>
    </li>
  );
}

export default function MessageList({
  messages,
  viewerId,
  loading,
  loadingOlder,
  nextCursor,
  onLoadOlder,
}: {
  messages: ChatMessage[];
  viewerId: string;
  loading: boolean;
  loadingOlder: boolean;
  nextCursor: string | null;
  onLoadOlder: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousScrollRef = useRef<{ height: number; top: number } | null>(null);
  const stickToBottomRef = useRef(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || loading) return;
    if (!initializedRef.current) {
      element.scrollTop = element.scrollHeight;
      initializedRef.current = true;
      return;
    }
    if (previousScrollRef.current) {
      const previous = previousScrollRef.current;
      element.scrollTop = previous.top + element.scrollHeight - previous.height;
      previousScrollRef.current = null;
      return;
    }
    if (stickToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [loading, messages.length]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 120;
    if (element.scrollTop < 100 && nextCursor && !loadingOlder) {
      previousScrollRef.current = { height: element.scrollHeight, top: element.scrollTop };
      onLoadOlder();
    }
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6" aria-label="Message history">
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground" aria-live="polite">Loading messages…</p>
      ) : (
        <>
          {loadingOlder ? <p className="pb-3 text-center text-xs text-muted-foreground" aria-live="polite">Loading older messages…</p> : null}
          {nextCursor && !loadingOlder ? <button type="button" onClick={() => { const element = scrollRef.current; if (element) previousScrollRef.current = { height: element.scrollHeight, top: element.scrollTop }; onLoadOlder(); }} className="mx-auto mb-3 flex min-h-[40px] rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Load older messages</button> : null}
          {messages.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>
          ) : (
            <ul className="space-y-3" aria-label="Messages">
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const showDate = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
                return (
                  <li key={message.id}>
                    {showDate ? <div className="my-4 text-center text-xs text-muted-foreground"><span className="rounded-full bg-muted px-3 py-1">{dayKey(message.createdAt)}</span></div> : null}
                    <ul><MessageBubble message={message} own={message.senderId === viewerId} /></ul>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
