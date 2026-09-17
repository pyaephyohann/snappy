"use client";

import { useEffect } from "react";

const DATA_ATTR = "data-snappy-telegram-mini-app";

/** Marks the document so global PWA UI can stay off the Mini App. */
export default function TelegramPwaSuppress() {
  useEffect(() => {
    document.documentElement.setAttribute(DATA_ATTR, "true");
    return () => {
      document.documentElement.removeAttribute(DATA_ATTR);
    };
  }, []);

  return null;
}

export function isSnappyTelegramMiniAppActive(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.documentElement.hasAttribute(DATA_ATTR);
}
