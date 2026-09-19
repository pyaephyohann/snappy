"use client";

import NotificationsPageClient from "@/components/notifications/NotificationsPageClient";

export default function TelegramMiniAppAlerts() {
  return (
    <div className="px-4 pb-6">
      <h1 className="mb-4 text-xl font-semibold text-foreground">Alerts</h1>
      <NotificationsPageClient miniAppPrefix="/telegram/app" />
    </div>
  );
}
