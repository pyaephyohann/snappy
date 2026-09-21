"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, MessageReactionSummary, MessageReactionType } from "@/lib/chat-client";
import { MESSAGE_REACTION_TYPES, toggleMessageReaction } from "@/lib/chat-client";

function dayKey(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function ReactionPicker({
  onSelect,
  onClose,
}: {
  onSelect: (type: MessageReactionType) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-1 flex gap-0.5 rounded-full border border-border bg-card px-1.5 py-1 shadow-md z-10"
      role="listbox"
      aria-label="Select a reaction"
    >
      {MESSAGE_REACTION_TYPES.map((type: MessageReactionType) => (
        <button
          key={type}
          type="button"
          role="option"
          aria-label={`React with ${type}`}
          className="flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring transition-transform hover:scale-125"
          onClick={() => {
            onSelect(type);
            onClose();
          }}
        >
          {type}
        </button>
      ))}
    </div>
  );
}

function ReactionBar({
  reactions,
  myReaction,
  onToggle,
}: {
  reactions: MessageReactionSummary[];
  myReaction: string | null;
  onToggle: (type: MessageReactionType) => void;
}) {
  if (reactions.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Reactions">
      {reactions.map((reaction) => (
        <button
          key={reaction.type}
          type="button"
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
            myReaction === reaction.type
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:bg-muted"
          }`}
          aria-label={`${reaction.type} ${reaction.count}${myReaction === reaction.type ? " (your reaction)" : ""}`}
          aria-pressed={myReaction === reaction.type}
          onClick={() => onToggle(reaction.type as MessageReactionType)}
        >
          <span>{reaction.type}</span>
          <span className="font-medium">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}

export function MessageBubble({
  message,
  own,
  conversationId,
  onReactionChange,
}: {
  message: ChatMessage;
  own: boolean;
  conversationId: string;
  onReactionChange?: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [optimisticReaction, setOptimisticReaction] = useState<string | null>(null);

  const displayMyReaction = optimisticReaction ?? message.myReaction;
  const displayReactions = message.reactions;

  const handleToggle = useCallback(
    async (type: MessageReactionType) => {
      const wasMyReaction = displayMyReaction === type;
      const previousReactions = displayReactions;
      const previousMyReaction = displayMyReaction;

      // Optimistic update
      setOptimisticReaction(wasMyReaction ? null : type);

      try {
        await toggleMessageReaction(conversationId, message.id, type);
        onReactionChange?.();
      } catch {
        // Revert on error
        setOptimisticReaction(previousMyReaction);
      }
    },
    [conversationId, message.id, displayMyReaction, displayReactions, onReactionChange],
  );

  return (
    <li className={`flex items-end gap-2 ${own ? "justify-end" : "justify-start"}`}>
      {!own ? (
        <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border">
          <Image src={message.sender.profileImage} alt="" fill sizes="28px" className="object-cover" />
        </div>
      ) : null}
      <div className={`max-w-[82%] sm:max-w-[70%] ${own ? "items-end" : "items-start"}`}>
        <div className="relative">
          <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-5 shadow-sm ${own ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card text-foreground"}`}>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>
          <button
            type="button"
            className={`absolute -bottom-1 ${own ? "-left-7" : "-right-7"} flex h-6 w-6 items-center justify-center rounded-full text-xs text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring transition-opacity ${showPicker ? "opacity-100" : "opacity-0 hover:opacity-100"}`}
            aria-label="Add reaction"
            onClick={() => setShowPicker(!showPicker)}
          >
            😊
          </button>
          {showPicker ? (
            <ReactionPicker
              onSelect={handleToggle}
              onClose={() => setShowPicker(false)}
            />
          ) : null}
        </div>
        <ReactionBar
          reactions={displayReactions}
          myReaction={displayMyReaction}
          onToggle={handleToggle}
        />
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
  conversationId,
  loading,
  loadingOlder,
  nextCursor,
  onLoadOlder,
  onReactionChange,
}: {
  messages: ChatMessage[];
  viewerId: string;
  conversationId: string;
  loading: boolean;
  loadingOlder: boolean;
  nextCursor: string | null;
  onLoadOlder: () => void;
  onReactionChange?: () => void;
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
                    <ul><MessageBubble message={message} own={message.senderId === viewerId} conversationId={conversationId} onReactionChange={onReactionChange} /></ul>
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
