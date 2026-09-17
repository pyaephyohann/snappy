import Script from "next/script";
import type { Metadata, Viewport } from "next";
import TelegramMiniAppLayoutClient from "@/components/telegram/TelegramMiniAppLayoutClient";

export const metadata: Metadata = {
  title: "Snappy · Telegram",
  description: "Snappy Telegram Mini App",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function TelegramMiniAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <div className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-background text-foreground">
        <TelegramMiniAppLayoutClient>{children}</TelegramMiniAppLayoutClient>
      </div>
    </>
  );
}
