"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchChatList, type ChatApiError, type ChatConversation } from "@/lib/chat-client";

const POLL_INTERVAL_MS = 15_000;

export function useChatList() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ChatApiError | null>(null);
  const loadingMoreRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollControllerRef = useRef<AbortController | null>(null);

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

  // Initial load
  useEffect(() => {
    const timer = window.setTimeout(() => void load(null, false), 0);
    return () => {
      window.clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [load]);

  // Polling: reconcile against server-authoritative state
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      pollControllerRef.current?.abort();
      const controller = new AbortController();
      pollControllerRef.current = controller;

      try {
        const result = await fetchChatList(null, controller.signal);
        if (controller.signal.aborted || cancelled) return;
        setConversations(result.conversations);
        setNextCursor(result.nextCursor);
      } catch {
        // Network errors during polling are non-fatal; the next poll retries.
      }
    }

    function startPolling() {
      if (pollTimerRef.current !== null) return;
      void poll();
      pollTimerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }

    // Start polling after initial load completes
    const waitForInitialLoad = setInterval(() => {
      if (!loading) {
        clearInterval(waitForInitialLoad);
        if (!cancelled && document.visibilityState === "visible") {
          startPolling();
        }
      }
    }, 100);

    function onVisibilityChange() {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        void poll();
        startPolling();
      } else {
        stopPolling();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(waitForInitialLoad);
      stopPolling();
      pollControllerRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loading]);

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
