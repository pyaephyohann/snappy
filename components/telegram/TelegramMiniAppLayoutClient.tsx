"use client";

import { type ReactNode } from "react";
import PresenceHeartbeat from "@/components/presence/PresenceHeartbeat";
import { TelegramMiniAppAuthProvider } from "@/components/telegram/TelegramMiniAppAuthProvider";
import TelegramPwaSuppress from "@/components/telegram/TelegramPwaSuppress";

export default function TelegramMiniAppLayoutClient({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <TelegramPwaSuppress />
      <PresenceHeartbeat />
      <TelegramMiniAppAuthProvider>{children}</TelegramMiniAppAuthProvider>
    </>
  );
}
