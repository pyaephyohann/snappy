"use client";

import { useCallback, useEffect, useRef } from "react";
import { markConversationRead } from "@/lib/chat-client";

export function useConversationReadState(
  conversationId: string,
  enabled: boolean,
) {
  const lastMarkedAtRef = useRef<number>(0);
  const markingRef = useRef(false);

  const markRead = useCallback(async () => {
    if (!enabled || markingRef.current || Date.now() - lastMarkedAtRef.current < 2_000) {
      return;
    }
    markingRef.current = true;
    try {
      await markConversationRead(conversationId);
      lastMarkedAtRef.current = Date.now();
    } catch {
      // Read state is non-blocking; a later focus or visibility event retries it.
    } finally {
      markingRef.current = false;
    }
  }, [conversationId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void markRead();
    const onFocus = () => void markRead();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void markRead();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, markRead]);

  return { markRead };
}
