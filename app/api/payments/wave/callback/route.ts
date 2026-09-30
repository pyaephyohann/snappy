/**
 * POST /api/payments/wave/callback — S7-B.3.
 *
 * Provider-to-server endpoint. NO browser session is required: the provider
 * authenticates itself through the documented HMAC callback signature,
 * verified in constant time inside the Wave adapter BEFORE any payment
 * field is trusted. There is no client-callable fulfillment equivalent —
 * fulfillment happens only through S7-A's module-branded internal boundary.
 *
 * Request handling:
 * - POST only; anything else is 405.
 * - Content-Type must be application/json (the documented Wave callback
 *   format); other types are rejected with 415.
 * - Body is bounded (64 KiB): larger payloads are rejected with 413 and
 *   never parsed. The exact raw body is what the signature covers.
 * - No raw payloads, signatures, or secrets are logged; log lines carry
 *   outcome kinds and static error codes only.
 *
 * Response semantics (deterministic; internal details never exposed):
 * - 200  verified callback handled: fulfilled (or idempotent duplicate), or
 *        a non-settling outcome was acknowledged.
 * - 400  malformed/unverifiable callback (bad JSON, failed signature,
 *        unknown status, merchant mismatch). The provider should not retry
 *        these — they will never become valid.
 * - 404  verified but no persisted purchase matches the references (this
 *        includes the S7-B.2 orphan case: never guessed, never fulfilled).
 * - 409  verified and matched but rejected: reference/amount/currency
 *        mismatch, or a state that cannot legitimately settle (e.g.
 *        CANCELED/EXPIRED, or an active-subscription conflict).
 * - 503  temporary server/database failure — the provider may retry; the
 *        callback is idempotent, so a retry is safe.
 *
 * A 200 does NOT mean the customer paid: it means the callback was verified
 * and handled according to its (normalized) outcome. Only a signature-
 * verified, reference-matched, amount-matched SUCCEEDED outcome can ever
 * move PENDING → SUCCEEDED, and browser redirects carry no authority.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  handleWavePaymentCallback,
  PaymentCallbackError,
} from "@/lib/payment-callback-service";
import { getPaymentProvider } from "@/lib/payment/payment-provider-factory";

const MAX_CALLBACK_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
  }

  let rawBody: string;
  try {
    const bodyBuffer = await request.arrayBuffer();
    if (bodyBuffer.byteLength > MAX_CALLBACK_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    rawBody = new TextDecoder("utf-8", { fatal: false }).decode(bodyBuffer);
  } catch {
    return NextResponse.json({ error: "Unreadable request body" }, { status: 400 });
  }

  try {
    await handleWavePaymentCallback(
      rawBody,
      getPaymentProvider(),
    );
    // Static, detail-free bodies; the provider only needs the status code.
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    if (error instanceof PaymentCallbackError) {
      // No provider details, no purchase details, no signatures — codes only.
      console.error("[PAYMENT-CALLBACK] rejected:", error.code);
      const status =
        error.code === "malformed_callback"
          ? 400
          : error.code === "purchase_not_found"
            ? 404
            : 409; // reference_mismatch / not_eligible / fulfillment_rejected
      return NextResponse.json({ error: "Callback not accepted" }, { status });
    }
    // Temporary infrastructure failure (DB unavailable, unexpected error):
    // 5xx so the provider retries; retries are idempotent by design.
    console.error("[PAYMENT-CALLBACK] temporary failure");
    return NextResponse.json({ error: "Temporary server error" }, { status: 503 });
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export function PUT() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
