const CLOUDINARY_HOST = "res.cloudinary.com";

export function isSnapDiscoverable(ownerIsActive: boolean): boolean {
  return ownerIsActive;
}

export function buildAbsoluteSnappyUrl(
  origin: string | null,
  path: string,
): string | null {
  if (!origin) {
    return null;
  }
  return `${origin.replace(/\/$/, "")}${path}`;
}

export function isTelegramSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === CLOUDINARY_HOST;
  } catch {
    return false;
  }
}

export function formatSnapDateForTelegram(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
