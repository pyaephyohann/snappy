"use client";

import TelegramConnectButton from "@/components/telegram/TelegramConnectButton";

/** @deprecated Use TelegramConnectButton with linkToken instead. */
export default function TelegramConnectClient({ token }: { token: string }) {
  return <TelegramConnectButton linkToken={token} />;
}
