"use client";

const DEVICE_ID_KEY = "snappy:device-id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length > 0) {
      return existing;
    }
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
