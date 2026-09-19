"use client";

import { useRouter } from "next/navigation";
import BottomNavCameraFlow from "@/components/mobile/BottomNavCameraFlow";
import { TELEGRAM_MINI_APP_ROUTES } from "@/lib/telegram/mini-app-routes";

export default function TelegramMiniAppCamera() {
  const router = useRouter();
  return <BottomNavCameraFlow onClose={() => router.push(TELEGRAM_MINI_APP_ROUTES.home)} />;
}
