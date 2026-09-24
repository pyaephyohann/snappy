"use client";

import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";

/**
 * Invisible presence heartbeat mount for the authenticated application chrome.
 * Shared by Web/PWA and the Telegram Mini App.
 */
export default function PresenceHeartbeat() {
  usePresenceHeartbeat();
  return null;
}
