"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatApiError,
  fetchConversationMessages,
  sendChatMessage,
  type ChatMessage,
} from "@/lib/chat-client";
import { MAX_MESSAGE_CODE_POINTS } from "@/lib/chat-validation";

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((left, right) => {
    const timeDifference =
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDifference || left.id.localeCompare(right.id);
  });
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

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInitial(), 0);
    return () => {
      window.clearTimeout(timer);
      initialControllerRef.current?.abort();
    };
  }, [loadInitial]);

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
