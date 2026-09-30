/**
 * Server-only payment provider configuration (S7-B.1).
 *
 * Resolves provider settings from environment variables. SERVER-ONLY: this
 * module must never be imported from client components, exposed through
 * NEXT_PUBLIC_* variables, returned in API responses, or logged. Secrets are
 * only ever held in the returned config object and fed into HMAC computation.
 *
 * Environment variables (names only — no values are ever committed):
 *   PAYMENT_PROVIDER       — "wavepay"
 *   PAYMENT_ENVIRONMENT    — "test" | "production"
 *   PAYMENT_MERCHANT_ID    — merchant id issued by the provider
 *   PAYMENT_MERCHANT_NAME  — display name on the provider payment screen
 *   PAYMENT_MERCHANT_SECRET— hash secret key issued by the provider
 *   PAYMENT_API_BASE_URL   — provider API base URL (https only)
 *
 * Missing or invalid configuration fails loudly with the offending variable
 * NAMES only — never their values, and never a silently defaulted credential.
 */

export interface WaveProviderConfig {
  readonly providerId: "wavepay";
  readonly environment: "test" | "production";
  readonly merchantId: string;
  readonly merchantName: string;
  readonly merchantSecret: string;
  readonly apiBaseUrl: string;
}

export class PaymentConfigError extends Error {
  constructor(
    public readonly invalidVariables: readonly string[],
    message: string,
  ) {
    super(message);
    this.name = "PaymentConfigError";
  }
}

const REQUIRED_VARIABLES = [
  "PAYMENT_PROVIDER",
  "PAYMENT_ENVIRONMENT",
  "PAYMENT_MERCHANT_ID",
  "PAYMENT_MERCHANT_NAME",
  "PAYMENT_MERCHANT_SECRET",
  "PAYMENT_API_BASE_URL",
] as const;

type EnvSource = Record<string, string | undefined>;

/**
 * Resolve Wave provider configuration from environment variables. Throws
 * `PaymentConfigError` listing missing/invalid variable NAMES when the
 * configuration is unusable — never fabricates credentials.
 */
export function resolveWaveProviderConfig(env: EnvSource = process.env): WaveProviderConfig {
  const missing = REQUIRED_VARIABLES.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new PaymentConfigError(
      missing,
      `missing required payment configuration variables: ${missing.join(", ")}`,
    );
  }

  const provider = env.PAYMENT_PROVIDER;
  if (provider !== "wavepay") {
    throw new PaymentConfigError(
      ["PAYMENT_PROVIDER"],
      'PAYMENT_PROVIDER must be "wavepay" for the Wave adapter',
    );
  }

  const environment = env.PAYMENT_ENVIRONMENT;
  if (environment !== "test" && environment !== "production") {
    throw new PaymentConfigError(
      ["PAYMENT_ENVIRONMENT"],
      'PAYMENT_ENVIRONMENT must be "test" or "production"',
    );
  }

  let apiBaseUrl: URL;
  try {
    apiBaseUrl = new URL(env.PAYMENT_API_BASE_URL as string);
  } catch {
    throw new PaymentConfigError(
      ["PAYMENT_API_BASE_URL"],
      "PAYMENT_API_BASE_URL must be a valid absolute URL",
    );
  }
  if (
    apiBaseUrl.protocol !== "https:" ||
    apiBaseUrl.username ||
    apiBaseUrl.password ||
    apiBaseUrl.pathname !== "/" ||
    apiBaseUrl.search ||
    apiBaseUrl.hash
  ) {
    throw new PaymentConfigError(
      ["PAYMENT_API_BASE_URL"],
      "PAYMENT_API_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment",
    );
  }

  // Bind each declared environment to the Wave endpoint documented in this
  // project: production uses the HTTPS production origin; sandbox uses the
  // documented test host and port. No other provider host is accepted.
  const hostname = apiBaseUrl.hostname.toLowerCase();
  const productionEndpoint =
    hostname === "payments.wavemoney.io" && apiBaseUrl.port === "";
  const testEndpoint =
    hostname === "testpayments.wavemoney.io" && apiBaseUrl.port === "8107";
  if (
    (environment === "production" && !productionEndpoint) ||
    (environment === "test" && !testEndpoint)
  ) {
    throw new PaymentConfigError(
      ["PAYMENT_ENVIRONMENT", "PAYMENT_API_BASE_URL"],
      "PAYMENT_ENVIRONMENT does not match the configured Wave endpoint",
    );
  }

  return {
    providerId: "wavepay",
    environment,
    merchantId: env.PAYMENT_MERCHANT_ID as string,
    merchantName: env.PAYMENT_MERCHANT_NAME as string,
    merchantSecret: env.PAYMENT_MERCHANT_SECRET as string,
    apiBaseUrl: apiBaseUrl.origin,
  };
}
