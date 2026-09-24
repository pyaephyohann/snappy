/** Minimal identity used where only the sender is displayed (message rows). */
export type ChatParty = {
  id: string;
  name: string;
  profileImage: string;
};

export type ChatParticipant = ChatParty & {
  /** Server-derived online state (S7). Never computed from the client clock. */
  isOnline: boolean;
  /** Server-derived last heartbeat timestamp, or null when never seen. */
  lastSeenAt: string | null;
};

export const MESSAGE_REACTION_TYPES = ["❤️", "😂", "😮", "😢", "👍", "👎"] as const;
export type MessageReactionType = (typeof MESSAGE_REACTION_TYPES)[number];

export type MessageReactionSummary = {
  type: string;
  count: number;
};

export type ChatMessage = {
  id: string;
  content: string;
  senderId: string;
  sender: ChatParty;
  createdAt: string;
  reactions: MessageReactionSummary[];
  myReaction: string | null;
};

export type ChatConversation = {
  conversationId: string;
  otherParticipant: ChatParticipant | null;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
  } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  canMessage: boolean;
};

export class ChatApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatApiError";
    this.status = status;
  }
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      credentials: "include",
    });
  } catch {
    throw new ChatApiError("Network error. Please try again.", 0);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Preserve the response status for non-JSON failures.
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : response.status === 429
          ? "Too many requests. Please try again later."
          : "Chat request failed.";
    throw new ChatApiError(message, response.status);
  }

  return body as T;
}

export async function fetchChatList(
  cursor: string | null,
  signal?: AbortSignal,
): Promise<{ conversations: ChatConversation[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  return requestJson(`/api/chats${params.size ? `?${params}` : ""}`, {
    signal,
    cache: "no-store",
  });
}

export async function fetchConversationMessages(
  conversationId: string,
  cursor: string | null,
  signal?: AbortSignal,
 ): Promise<{ messages: ChatMessage[]; nextCursor: string | null; canMessage: boolean; otherParticipant: ChatParticipant }> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  return requestJson(
    `/api/chats/${encodeURIComponent(conversationId)}/messages${params.size ? `?${params}` : ""}`,
    { signal, cache: "no-store" },
  );
}

export async function sendChatMessage(
  conversationId: string,
  content: string,
): Promise<{ message: ChatMessage }> {
  return requestJson(`/api/chats/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export async function markConversationRead(
  conversationId: string,
): Promise<{ conversationId: string; readAt: string }> {
  return requestJson(`/api/chats/${encodeURIComponent(conversationId)}/read`, {
    method: "PATCH",
  });
}

export async function toggleMessageReaction(
  conversationId: string,
  messageId: string,
  reactionType: MessageReactionType,
): Promise<{ action: "created" | "removed" | "replaced"; myReaction: string | null }> {
  return requestJson(
    `/api/chats/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: reactionType }),
    },
  );
}

export async function removeMessageReaction(
  conversationId: string,
  messageId: string,
): Promise<{ action: "removed"; myReaction: null }> {
  return requestJson(
    `/api/chats/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    { method: "DELETE" },
  );
}
