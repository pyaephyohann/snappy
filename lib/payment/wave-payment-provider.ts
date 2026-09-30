/**
 * Wave Money (Pay with Wave) payment provider adapter (S7-B.1).
 *
 * Maps the provider-independent payment contract onto the documented Wave
 * Payment Gateway merchant integration:
 *
 * - Payment request: form-encoded POST to `/payment` with the documented
 *   fields and the documented request hash:
 *     HMAC-SHA256(time_to_live_in_seconds + merchant_id + order_id + amount +
 *     backend_result_url + merchant_reference_id, secret) — lowercase hex.
 * - Payment screen: GET `/authenticate?transaction_id=<transaction_id>`.
 * - Callback: JSON POST with the documented fields and the documented
 *   callback hash:
 *     HMAC-SHA256(status + timeToLiveSeconds + merchantId + orderId + amount +
 *     backendResultUrl + merchantReferenceId + initiatorMsisdn + transactionId +
 *     paymentRequestId + requestTime, secret) — lowercase hex.
 *   Only `status = PAYMENT_CONFIRMED` is a successful transaction; all other
 *   documented statuses are reporting outcomes and normalize accordingly.
 *
 * Field mapping (documented Wave semantics):
 * - `order_id`             ← orderReferenceId (one per logical order)
 * - `merchant_reference_id`← purchaseId (unique per payment request)
 * - `paymentRequestId`     → providerReferenceId (documented "primary
 *                            tracking id for every payment"; this is what a
 *                            verified fulfillment records)
 * - `transactionId`        → providerEventId (Wave bill-collect transaction
 *                            identity for this event)
 * - create-response `transaction_id` is an encrypted redirect handle only —
 *   it appears in `paymentUrl` and is not a durable identity.
 *
 * S7-B.1 performs NO network calls: the HTTP transport is injected and tests
 * use a fake. No credentials are hard-coded — everything comes from
 * `resolveWaveProviderConfig()`.
 *
 * Documented ambiguity carried to S7-B.2 (not guessed here): the request
 * table types `order_id`/`merchant_reference_id` as "string" while the PHP
 * sample comments describe them as "unsigned integer"; this adapter sends the
 * documented string form values and S7-B.2 must confirm the accepted format
 * in the Wave sandbox during merchant onboarding.
 */
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  VerifyCallbackInput,
  VerifiedPaymentResult,
  NormalizedPaymentStatus,
} from "./payment-contract";
import { PaymentProviderError } from "./payment-contract";
import type { HttpTransport } from "./http-transport";
import type { WaveProviderConfig } from "./payment-config";
import {
  computeWaveHmac,
  verifyWaveHmac,
  waveCallbackHashMessage,
  waveRequestHashMessage,
} from "./wave-signature";

/** Documented maximum payment TTL: 10 minutes. */
export const WAVE_MAX_TTL_SECONDS = 600;

export interface WavePaymentProviderDeps {
  config: WaveProviderConfig;
  transport: HttpTransport;
  /** Injectable clock; defaults to the system clock. */
  now?: () => Date;
}

/** Documented callback statuses → normalized payment outcomes. */
const STATUS_MAP: Record<string, NormalizedPaymentStatus> = {
  PAYMENT_CONFIRMED: "SUCCEEDED",
  TRANSACTION_TIMED_OUT: "TIMED_OUT",
  SCHEDULER_TRANSACTION_TIMED_OUT: "TIMED_OUT",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  ACCOUNT_LOCKED: "FAILED",
  BILL_COLLECTION_FAILED: "FAILED",
  PAYMENT_REQUEST_CANCELLED: "CANCELED",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(fields: Record<string, unknown>, name: string): string {
  const value = fields[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new PaymentProviderError("malformed_callback", `callback field ${name} is missing or invalid`);
  }
  return value;
}

function requirePositiveInteger(fields: Record<string, unknown>, name: string): number {
  const value = fields[name];
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isInteger(num) || num <= 0) {
    throw new PaymentProviderError("malformed_callback", `callback field ${name} is missing or invalid`);
  }
  return num;
}

/** Hashed as the literal "null" when absent — documented Wave null rule. */
function nullableString(fields: Record<string, unknown>, name: string): string | null {
  const value = fields[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createWavePaymentProvider(deps: WavePaymentProviderDeps): PaymentProvider {
  const { config, transport } = deps;
  const now = deps.now ?? (() => new Date());

  function buildPaymentUrl(transactionId: string): string {
    return `${config.apiBaseUrl}/authenticate?transaction_id=${encodeURIComponent(transactionId)}`;
  }

  return {
    providerId: "wavepay",

    async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      // Server-derived input only; validate before touching the provider.
      if (input.currency !== "MMK") {
        throw new PaymentProviderError("invalid_input", "Wave payments are denominated in MMK");
      }
      if (!Number.isInteger(input.amountMmk) || input.amountMmk <= 0) {
        throw new PaymentProviderError("invalid_input", "amount must be a positive integer");
      }
      const ttlSeconds = Math.round((input.expiresAt.getTime() - now().getTime()) / 1000);
      if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
        throw new PaymentProviderError("invalid_input", "expiresAt must be in the future");
      }
      if (ttlSeconds > WAVE_MAX_TTL_SECONDS) {
        throw new PaymentProviderError(
          "invalid_input",
          `payment TTL exceeds the documented ${WAVE_MAX_TTL_SECONDS}-second limit`,
        );
      }
      if (!input.orderReferenceId || !input.purchaseId) {
        throw new PaymentProviderError("invalid_input", "order reference and purchase id are required");
      }
      if (!input.backendCallbackUrl || !input.frontendReturnUrl) {
        throw new PaymentProviderError("invalid_input", "callback and return URLs are required");
      }

      const ttl = String(ttlSeconds);
      const amount = String(input.amountMmk);
      const hash = computeWaveHmac(
        waveRequestHashMessage({
          time_to_live_in_seconds: ttl,
          merchant_id: config.merchantId,
          order_id: input.orderReferenceId,
          amount,
          backend_result_url: input.backendCallbackUrl,
          merchant_reference_id: input.purchaseId,
        }),
        config.merchantSecret,
      );

      // Deterministic display rows derived from the server-side description.
      const items = JSON.stringify([{ name: input.paymentDescription, amount: input.amountMmk }]);

      const response = await transport.postForm({
        url: `${config.apiBaseUrl}/payment`,
        form: {
          time_to_live_in_seconds: ttl,
          merchant_id: config.merchantId,
          order_id: input.orderReferenceId,
          merchant_reference_id: input.purchaseId,
          frontend_result_url: input.frontendReturnUrl,
          backend_result_url: input.backendCallbackUrl,
          amount,
          payment_description: input.paymentDescription,
          merchant_name: config.merchantName,
          items,
          hash,
        },
      });

      if (response.status === 200) {
        const body = response.body;
        if (!isRecord(body) || body.message !== "success" || typeof body.transaction_id !== "string" || !body.transaction_id) {
          throw new PaymentProviderError("unexpected_response", "payment creation response is malformed");
        }
        return {
          providerReferenceId: body.transaction_id,
          paymentUrl: buildPaymentUrl(body.transaction_id),
          providerStatus: "PENDING",
          expiresAt: input.expiresAt,
        };
      }
      if (response.status === 409) {
        // Documented: "Record already exists" — a replayed payment request.
        throw new PaymentProviderError("duplicate_request", "payment request already exists");
      }
      if (response.status === 400) {
        // Documented: "INVALID_HASH" — our signature/secret is wrong.
        throw new PaymentProviderError("provider_rejected", "payment request hash rejected");
      }
      if (response.status === 404) {
        // Documented: "No record found" — invalid merchant account.
        throw new PaymentProviderError("provider_rejected", "merchant account rejected");
      }
      if (response.status === 422) {
        throw new PaymentProviderError("invalid_input", "payment request fields rejected");
      }
      throw new PaymentProviderError("unexpected_response", `unexpected provider status ${response.status}`);
    },

    async verifyCallback(input: VerifyCallbackInput): Promise<VerifiedPaymentResult> {
      let parsed: unknown;
      try {
        parsed = JSON.parse(input.rawBody);
      } catch {
        throw new PaymentProviderError("malformed_callback", "callback body is not valid JSON");
      }
      if (!isRecord(parsed)) {
        throw new PaymentProviderError("malformed_callback", "callback body is not an object");
      }
      const fields = parsed;

      // Documented mandatory fields (orderId/paymentDescription/currency are
      // documented optional; currency defaults to MMK).
      const status = requireString(fields, "status");
      const merchantId = requireString(fields, "merchantId");
      const merchantReferenceId = requireString(fields, "merchantReferenceId");
      const backendResultUrl = requireString(fields, "backendResultUrl");
      const initiatorMsisdn = requireString(fields, "initiatorMsisdn");
      const transactionId = requireString(fields, "transactionId");
      const paymentRequestId = requireString(fields, "paymentRequestId");
      const requestTime = requireString(fields, "requestTime");
      const hashValue = requireString(fields, "hashValue");
      const amount = requirePositiveInteger(fields, "amount");
      const timeToLiveSeconds = requirePositiveInteger(fields, "timeToLiveSeconds");
      // Hashed as "null" when absent — documented null rule.
      const orderId = nullableString(fields, "orderId");
      const currency = nullableString(fields, "currency") ?? "MMK";

      if (merchantId !== config.merchantId) {
        throw new PaymentProviderError("merchant_mismatch", "callback merchant id does not match configuration");
      }
      // Binding key for purchase matching — without it fulfillment cannot
      // verify ownership, so its absence is a hard failure.
      if (orderId === null) {
        throw new PaymentProviderError("malformed_callback", "callback orderId is required for purchase binding");
      }

      // Documented callback hash, verified in constant time BEFORE any
      // outcome is trusted.
      const message = waveCallbackHashMessage({
        status,
        timeToLiveSeconds,
        merchantId,
        orderId,
        amount,
        backendResultUrl,
        merchantReferenceId,
        initiatorMsisdn,
        transactionId,
        paymentRequestId,
        requestTime,
      });
      if (!verifyWaveHmac(message, hashValue, config.merchantSecret)) {
        throw new PaymentProviderError("invalid_signature", "callback signature verification failed");
      }

      const normalized = STATUS_MAP[status];
      if (!normalized) {
        // Unknown provider status: reject safely, never guess an outcome.
        throw new PaymentProviderError("unknown_status", `unrecognized provider status ${status}`);
      }

      return {
        providerReferenceId: paymentRequestId,
        orderReferenceId: orderId,
        merchantReferenceId: merchantReferenceId,
        amountMmk: amount,
        currency,
        status: normalized,
        verifiedAt: now(),
        providerEventId: transactionId,
      };
    },
  };
}
