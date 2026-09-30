/**
 * Wave payment gateway signature helpers (S7-B.1).
 *
 * Implements the documented hash contract of the Pay with Wave Payment
 * Gateway merchant integration document:
 *
 * - HMAC-SHA256, lowercase hex digest (documented reference snippets use
 *   hash_hmac('sha256', ...) / CryptoJS.HmacSHA256(...), both hex).
 * - Canonical message = the documented field values concatenated WITHOUT a
 *   separator, in the documented order.
 * - null values hash as the literal string "null" (documented rule).
 *
 * Documented field orders (verbatim from the merchant document):
 *
 *   payment request:
 *     time_to_live_in_seconds + merchant_id + order_id + amount +
 *     backend_result_url + merchant_reference_id
 *
 *   callback:
 *     status + timeToLiveSeconds + merchantId + orderId + amount +
 *     backendResultUrl + merchantReferenceId + initiatorMsisdn +
 *     transactionId + paymentRequestId + requestTime
 *
 * Nothing here invents fields or ordering. Keep this module isolated and
 * unit-testable; it performs no I/O.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type WaveHashValue = string | number | null | undefined;

/**
 * Documented null rule: a null value contributes the literal string "null"
 * to the message (e.g. msisdn+null+merchantId → "9791009039nulltestmerchantID").
 */
function hashPart(value: WaveHashValue): string {
  return value === null || value === undefined ? "null" : String(value);
}

export interface WaveRequestHashValues {
  time_to_live_in_seconds: WaveHashValue;
  merchant_id: WaveHashValue;
  order_id: WaveHashValue;
  amount: WaveHashValue;
  backend_result_url: WaveHashValue;
  merchant_reference_id: WaveHashValue;
}

export interface WaveCallbackHashValues {
  status: WaveHashValue;
  timeToLiveSeconds: WaveHashValue;
  merchantId: WaveHashValue;
  orderId: WaveHashValue;
  amount: WaveHashValue;
  backendResultUrl: WaveHashValue;
  merchantReferenceId: WaveHashValue;
  initiatorMsisdn: WaveHashValue;
  transactionId: WaveHashValue;
  paymentRequestId: WaveHashValue;
  requestTime: WaveHashValue;
}

/** Canonical message for a payment request, in the documented field order. */
export function waveRequestHashMessage(values: WaveRequestHashValues): string {
  return [
    values.time_to_live_in_seconds,
    values.merchant_id,
    values.order_id,
    values.amount,
    values.backend_result_url,
    values.merchant_reference_id,
  ]
    .map(hashPart)
    .join("");
}

/** Canonical message for a callback, in the documented field order. */
export function waveCallbackHashMessage(values: WaveCallbackHashValues): string {
  return [
    values.status,
    values.timeToLiveSeconds,
    values.merchantId,
    values.orderId,
    values.amount,
    values.backendResultUrl,
    values.merchantReferenceId,
    values.initiatorMsisdn,
    values.transactionId,
    values.paymentRequestId,
    values.requestTime,
  ]
    .map(hashPart)
    .join("");
}

/** HMAC-SHA256 of a canonical message as lowercase hex. */
export function computeWaveHmac(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Constant-time signature verification. Returns false (never throws) for
 * malformed signatures (wrong length, non-hex). Comparison is timing-safe.
 */
export function verifyWaveHmac(message: string, signature: string, secret: string): boolean {
  if (typeof signature !== "string" || !HEX_64.test(signature)) {
    return false;
  }
  const expected = Buffer.from(computeWaveHmac(message, secret), "utf8");
  const provided = Buffer.from(signature.toLowerCase(), "utf8");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
