"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatApiError,
  fetchConversationMessages,
  sendChatMessage,
  type ChatMessage,
} from "@/lib/chat-client";
import { MAX_MESSAGE_CODE_POINTS } from "@/lib/chat-validation";

const POLL_INTERVAL_MS = 3_000;

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((left, right) => {
    const timeDifference =
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDifference || left.id.localeCompare(right.id);
  });
}

function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const seen = new Set(current.map((message) => message.id));
  const newMessages = incoming.filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
  if (newMessages.length === 0) return current;
  return sortMessages([...current, ...newMessages]);
}

/**
 * Walk backward from the newest page through cursor pagination until
 * we find overlap with the local message set, or exhaust all history.
 * This ensures missed messages are recovered after disconnection.
 */
async function reconcileMissedMessages(
  conversationId: string,
  localMessages: ChatMessage[],
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const newest = await fetchConversationMessages(conversationId, null, signal);
  if (signal?.aborted) return localMessages;

  let merged = mergeMessages(localMessages, newest.messages);
  if (signal?.aborted) return merged;

  const localIds = new Set(localMessages.map((message) => message.id));
  const hasOverlap = newest.messages.some((message) => localIds.has(message.id));
  if (hasOverlap) return merged;

  let cursor = newest.nextCursor;
  const visited = new Set(newest.messages.map((message) => message.id));

  while (cursor) {
    const page = await fetchConversationMessages(conversationId, cursor, signal);
    if (signal?.aborted) return merged;

    merged = mergeMessages(merged, page.messages);
    cursor = page.nextCursor;

    if (page.messages.some((message) => localIds.has(message.id))) break;

    const allNew = page.messages.every((message) => visited.has(message.id));
    if (allNew || page.messages.length === 0) break;
    for (const message of page.messages) visited.add(message.id);
  }

  return merged;
}

export function useConversationMessages(conversationId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatApiError | null>(null);
  const [canMessage, setCanMessage] = useState(false);
  const [otherParticipant, setOtherParticipant] = useState<ChatMessage["sender"] | null>(null);
  const loadingOlderRef = useRef(false);
  const initialControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollControllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const loadInitial = useCallback(async () => {
    initialControllerRef.current?.abort();
    const controller = new AbortController();
    initialControllerRef.current = controller;
    setLoading(true);
    setError(null);
    setMessages([]);
    setNextCursor(null);
    setCanMessage(false);
    setOtherParticipant(null);

    try {
      const result = await fetchConversationMessages(conversationId, null, controller.signal);
      if (controller.signal.aborted) return;
      setMessages(sortMessages(result.messages));
      setNextCursor(result.nextCursor);
      setCanMessage(result.canMessage);
      setOtherParticipant(result.otherParticipant);
    } catch (loadError) {
      if (!controller.signal.aborted) setError(loadError as ChatApiError);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    if (!nextCursor || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setError(null);
    try {
      const result = await fetchConversationMessages(conversationId, nextCursor);
      setMessages((current) => {
        const seen = new Set(current.map((message) => message.id));
        return sortMessages([
          ...current,
          ...result.messages.filter((message) => {
            if (seen.has(message.id)) return false;
            seen.add(message.id);
            return true;
          }),
        ]);
      });
      setNextCursor(result.nextCursor);
    } catch (loadError) {
      setError(loadError as ChatApiError);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [conversationId, nextCursor]);

  const sendMessage = useCallback(async (rawContent: string) => {
    const content = rawContent.trim();
    if (!content || [...content].length > MAX_MESSAGE_CODE_POINTS || sending) {
      return false;
    }

    setSending(true);
    setError(null);
    try {
      const result = await sendChatMessage(conversationId, content);
      setMessages((current) => {
        if (current.some((message) => message.id === result.message.id)) {
          return current;
        }
        return sortMessages([...current, result.message]);
      });
      return true;
    } catch (sendError) {
      setError(sendError as ChatApiError);
      return false;
    } finally {
      setSending(false);
    }
  }, [conversationId, sending]);

  // Initial load
  useEffect(() => {
    const timer = window.setTimeout(() => void loadInitial(), 0);
    return () => {
      window.clearTimeout(timer);
      initialControllerRef.current?.abort();
    };
  }, [loadInitial]);

  // Polling: fetch latest page and reconcile missed messages
  useEffect(() => {
    let cancelled = false;
    generationRef.current += 1;
    const generation = generationRef.current;

    async function poll() {
      pollControllerRef.current?.abort();
      const controller = new AbortController();
      pollControllerRef.current = controller;

      try {
        const result = await fetchConversationMessages(conversationId, null, controller.signal);
        if (controller.signal.aborted || cancelled || generation !== generationRef.current) return;

        const merged = await reconcileMissedMessages(conversationId, result.messages, controller.signal);
        if (controller.signal.aborted || cancelled || generation !== generationRef.current) return;

        setMessages((current) => {
          const mergedSet = mergeMessages(current, merged);
          return mergedSet === current ? current : mergedSet;
        });
        setNextCursor(result.nextCursor);
        setCanMessage(result.canMessage);
        setOtherParticipant(result.otherParticipant);
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

    // Start polling only after initial load completes
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
  }, [conversationId, loading]);

  return {
    messages,
    nextCursor,
    loading,
    loadingOlder,
    sending,
    error,
    canMessage,
    otherParticipant,
    reload: loadInitial,
    loadOlder,
    sendMessage,
  };
}
