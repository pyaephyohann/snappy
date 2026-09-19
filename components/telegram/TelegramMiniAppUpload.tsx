"use client";

import { useRouter } from "next/navigation";
import BottomNavCameraFlow from "@/components/mobile/BottomNavCameraFlow";
import { TELEGRAM_MINI_APP_ROUTES } from "@/lib/telegram/mini-app-routes";

/**
 * Telegram uses the same upload flow as the web camera action: friend target,
 * camera/gallery capture, preview, caption, and shared Snap creation API.
 */
export default function TelegramMiniAppUpload() {
  const router = useRouter();

  return (
    <BottomNavCameraFlow
      onClose={() => router.push(TELEGRAM_MINI_APP_ROUTES.home)}
    />
  );
}
