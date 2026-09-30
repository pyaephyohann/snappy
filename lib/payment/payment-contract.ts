/**
 * Provider-agnostic payment domain contract (S7-B.1).
 *
 * Pure domain types for the payment boundary: what the server sends to a
 * payment provider, what comes back, and what a verified callback proves.
 *
 * Rules for this module:
 * - NO Prisma models or database types — payment-domain data only.
 * - NO provider-specific payload shapes (those live in the provider adapter).
 * - The client never constructs `CreatePaymentInput` and never sees secrets.
 * - `VerifiedPaymentResult` represents server-verified provider data (a
 *   signature-checked provider callback), never a client claim.
 */

/** Normalized outcome of a server-verified provider payment event. */
export type NormalizedPaymentStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED"
  | "TIMED_OUT"
  | "INSUFFICIENT_BALANCE";

/**
 * Server-authoritative values required to initialize one payment attempt.
 * Every field is derived by the server from the stored purchase + config;
 * the client never supplies or overrides any of them.
 */
export interface CreatePaymentInput {
  /** Internal purchase identity (maps to the provider-side order id). */
  purchaseId: string;
  /** Deterministic merchant order reference (S7-A `orderReferenceId`). */
  orderReferenceId: string;
  /** Server-derived amount (S7-A `amountMmk`); integer minor-free MMK. */
  amountMmk: number;
  /** Server-derived currency (S7-A `currency`), "MMK". */
  currency: string;
  /** Absolute expiry of the payment attempt (drives the provider TTL). */
  expiresAt: Date;
  /** HTTPS server callback URL for provider-verified results. */
  backendCallbackUrl: string;
  /** Browser return URL — navigation only, never proof of payment. */
  frontendReturnUrl: string;
  /** Human-readable description shown on the provider payment screen. */
  paymentDescription: string;
}

/** Normalized state of an accepted payment initialization. */
export type PaymentInitiationStatus = "PENDING";

/** Normalized provider output of payment creation. */
export interface CreatePaymentResult {
  /** Provider-side reference for this payment attempt. */
  providerReferenceId: string;
  /** Provider payment/redirect URL, or null when the provider has none. */
  paymentUrl: string | null;
  /** Provider-accepted creation state (awaiting payment + verification). */
  providerStatus: PaymentInitiationStatus;
  /** Absolute expiry of this payment attempt. */
  expiresAt: Date;
}

/**
 * A raw provider callback exactly as received by the server route. Only the
 * server-side verifier consumes this; nothing here is client-attested proof.
 */
export interface VerifyCallbackInput {
  /** Exact raw request body (JSON string) as delivered by the provider. */
  rawBody: string;
}

/**
 * Normalized result of a successfully verified provider callback. Carries
 * only provider-neutral payment-domain data; provider payload shapes stay
 * inside the adapter.
 */
export interface VerifiedPaymentResult {
  /** Provider-side payment-request reference (stable across the attempt). */
  providerReferenceId: string;
  /** Merchant order reference echoed by the provider (S7-A binding key). */
  orderReferenceId: string;
  /** Merchant reference assigned at initialization (echoed by the provider). */
  merchantReferenceId: string;
  /** Provider-verified amount. */
  amountMmk: number;
  /** Provider-verified currency. */
  currency: string;
  /** Provider-verified normalized outcome. */
  status: NormalizedPaymentStatus;
  /** Timestamp of successful server-side verification. */
  verifiedAt: Date;
  /** Provider identity of this specific event, when available. */
  providerEventId: string;
}

/** Provider-neutral error codes for payment provider operations. */
export type PaymentProviderErrorCode =
  | "invalid_input"
  | "transport_error"
  | "unexpected_response"
  | "duplicate_request"
  | "provider_rejected"
  | "malformed_callback"
  | "invalid_signature"
  | "merchant_mismatch"
  | "unknown_status";

/** Error thrown by payment provider adapters and configuration resolution. */
export class PaymentProviderError extends Error {
  constructor(
    public readonly code: PaymentProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/**
 * The provider-independent payment contract. Concrete provider adapters
 * implement this; the payment domain and purchase services depend only on
 * these types — never on provider payloads.
 */
export interface PaymentProvider {
  /** Stable provider identity chosen by the adapter (a short slug). */
  readonly providerId: string;

  /** Initialize one server-derived payment attempt with the provider. */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /**
   * Verify a raw provider callback (signature + structure) and normalize it.
   * Throws a provider error on malformed input, failed signature, or unknown
   * status — it never returns unverified data as verified.
   */
  verifyCallback(input: VerifyCallbackInput): Promise<VerifiedPaymentResult>;
}
