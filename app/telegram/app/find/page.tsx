import { Suspense } from "react";
import TelegramMiniAppFind from "@/components/telegram/TelegramMiniAppFind";

export default function TelegramMiniAppFindPage() {
  return (
    <Suspense
      fallback={
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      }
    >
      <TelegramMiniAppFind />
    </Suspense>
  );
}
