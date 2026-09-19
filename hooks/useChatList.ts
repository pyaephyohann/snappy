"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchChatList, type ChatApiError, type ChatConversation } from "@/lib/chat-client";

export function useChatList() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ChatApiError | null>(null);
  const loadingMoreRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async (cursor: string | null, append: boolean) => {
    if (append && loadingMoreRef.current) return;
    if (!append) {
      controllerRef.current?.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetchChatList(cursor, controller.signal);
      if (controller.signal.aborted) return;
      setConversations((current) => {
        if (!append) return result.conversations;
        const seen = new Set(current.map((conversation) => conversation.conversationId));
        return [
          ...current,
          ...result.conversations.filter((conversation) => {
            if (seen.has(conversation.conversationId)) return false;
            seen.add(conversation.conversationId);
            return true;
          }),
        ];
      });
      setNextCursor(result.nextCursor);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(loadError as ChatApiError);
    } finally {
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  const reload = useCallback(() => {
    void load(null, false);
  }, [load]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loadingMoreRef.current) {
      void load(nextCursor, true);
    }
  }, [load, nextCursor]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(null, false), 0);
    return () => {
      window.clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [load]);

  return {
    conversations,
    nextCursor,
    loading,
    loadingMore,
    error,
    reload,
    loadMore,
  };
}
