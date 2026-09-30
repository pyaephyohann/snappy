/**
 * Server-side payment URL configuration (S7-B.2).
 *
 * Both origins are explicit server configuration; neither is accepted from a
 * request or derived from Host/browser data. Invalid explicit values fail
 * closed instead of silently falling back to a different deployment.
 *
 * SERVER-ONLY: never import from client code; never log these derivations.
 */

export interface PaymentUrlConfig {
  backendCallbackUrl: string;
  frontendReturnUrl: string;
}

function normalizeHttpsOrigin(value: string | undefined, allowHostOnly = false): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const candidate = allowHostOnly && !/^https?:\/\//i.test(trimmed)
    ? `https://${trimmed}`
    : trimmed;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the payment URL pair, or null when the deployment has no usable
 * HTTPS public origin (payment initialization then fails closed with 503).
 */
export function getPaymentUrlConfig(): PaymentUrlConfig | null {
  const explicitBase = process.env.SNAPPY_PUBLIC_URL;
  const vercelBase = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  // Presence, not truthiness, distinguishes unset from explicitly invalid
  // configuration (including whitespace); never hide it with a fallback.
  const base = explicitBase !== undefined
    ? normalizeHttpsOrigin(explicitBase)
    : normalizeHttpsOrigin(vercelBase, true);
  if (!base) return null;

  // Optional dedicated callback origin (e.g. a stable API domain); if set,
  // it must itself be a valid HTTPS origin. Never trust request Host/query.
  const explicitCallback = process.env.PAYMENT_CALLBACK_BASE_URL;
  const callbackBase = explicitCallback !== undefined
    ? normalizeHttpsOrigin(explicitCallback)
    : base;
  if (!callbackBase) return null;

  return {
    backendCallbackUrl: `${callbackBase}/api/payments/wave/callback`,
    frontendReturnUrl: `${base}/subscription/checkout/return`,
  };
}
