export const CHAT_PAGE_SIZE = 20;
export const MAX_MESSAGE_CODE_POINTS = 2_000;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DISALLOWED_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

export type MessageCursor = {
  createdAt: string;
  id: string;
};

export type ConversationCursor = {
  lastMessageAt: string | null;
  id: string;
};

export function isValidChatId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export function normalizeUserPair(viewerId: string, targetUserId: string): {
  userLowId: string;
  userHighId: string;
} | null {
  if (viewerId === targetUserId) {
    return null;
  }

  return viewerId < targetUserId
    ? { userLowId: viewerId, userHighId: targetUserId }
    : { userLowId: targetUserId, userHighId: viewerId };
}

export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeMessageCursor(value: string | null): MessageCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<MessageCursor>;
    if (
      typeof parsed.id !== "string" ||
      !isValidChatId(parsed.id) ||
      typeof parsed.createdAt !== "string" ||
      Number.isNaN(new Date(parsed.createdAt).getTime())
    ) {
      return null;
    }
    return { id: parsed.id, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

export function encodeConversationCursor(cursor: ConversationCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeConversationCursor(
  value: string | null,
): ConversationCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ConversationCursor>;
    if (
      typeof parsed.id !== "string" ||
      !isValidChatId(parsed.id) ||
      (parsed.lastMessageAt !== null &&
        (typeof parsed.lastMessageAt !== "string" ||
          Number.isNaN(new Date(parsed.lastMessageAt).getTime())))
    ) {
      return null;
    }
    return {
      id: parsed.id,
      lastMessageAt: parsed.lastMessageAt ?? null,
    };
  } catch {
    return null;
  }
}

export function validateMessageContent(value: unknown):
  | { ok: true; content: string }
  | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "Message content must be text" };
  }

  const content = value.trim();
  if (!content) {
    return { ok: false, error: "Message content cannot be empty" };
  }
  if ([...content].length > MAX_MESSAGE_CODE_POINTS) {
    return {
      ok: false,
      error: `Message content cannot exceed ${MAX_MESSAGE_CODE_POINTS} characters`,
    };
  }
  if (DISALLOWED_CONTROL_CHARACTERS.test(content)) {
    return { ok: false, error: "Message contains invalid control characters" };
  }

  return { ok: true, content };
}
