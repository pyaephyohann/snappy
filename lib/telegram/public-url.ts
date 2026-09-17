/**
 * Resolves the public Snappy web URL for Telegram buttons.
 * Never invents a domain — only uses explicit config or Vercel's production host.
 */
export function getSnappyPublicUrl(): string | null {
  const explicit = process.env.SNAPPY_PUBLIC_URL?.trim();
  if (explicit) {
    return normalizeHttpsOrigin(explicit);
  }

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) {
    return normalizeHttpsOrigin(vercelProduction);
  }

  return null;
}

export function getTelegramWebhookUrl(): string | null {
  const explicit = process.env.TELEGRAM_WEBHOOK_URL?.trim();
  if (explicit) {
    return normalizeHttpsUrl(explicit);
  }

  const publicUrl = getSnappyPublicUrl();
  if (!publicUrl) {
    return null;
  }

  return `${publicUrl}/api/telegram/webhook`;
}

function normalizeHttpsOrigin(value: string): string | null {
  const url = parseHttpsUrl(value);
  return url ? url.origin : null;
}

function normalizeHttpsUrl(value: string): string | null {
  const url = parseHttpsUrl(value);
  if (!url) {
    return null;
  }
  const path = url.pathname.replace(/\/$/, "") || "/";
  return `${url.origin}${path}${url.search}`;
}

function parseHttpsUrl(value: string): URL | null {
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "https:") {
      console.error("[TELEGRAM] Public/webhook URL must use https");
      return null;
    }
    return url;
  } catch {
    console.error("[TELEGRAM] Invalid public/webhook URL");
    return null;
  }
}
