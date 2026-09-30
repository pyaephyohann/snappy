/**
 * POST /api/subscription/purchases/[id]/payment — S7-B.2.
 *
 * Secure, idempotent payment initialization for an existing purchase.
 * The client supplies ONLY the purchase id (URL) and an Idempotency-Key
 * header — no amount, currency, plan, order reference, provider reference,
 * status, URLs, or credentials are ever accepted from the request body
 * (the body is intentionally not read at all).
 *
 * Response contract (provider-neutral, client-safe):
 *   200 { purchaseId, status: "PENDING", paymentUrl, expiresAt }
 *   400 invalid/missing Idempotency-Key
 *   401 unauthenticated
 *   404 purchase not found OR not owned by the caller (indistinguishable)
 *   409 purchase not eligible (terminal/illegal state) or payment already
 *       requested at the provider without recoverable redirect data
 *   503 payment URLs or provider configuration not available
 *   502 provider rejected/failed/malformed (raw provider payloads never
 *       reach the client)
 *
 * A 200 means the PROVIDER ACCEPTED the payment request (INITIALIZED →
 * PENDING). It does NOT mean the customer paid; only a server-verified
 * provider callback (S7-B.3) can ever lead to SUCCEEDED/fulfillment.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth";
import { isSocialMutationRateLimited } from "@/lib/social-rate-limit";
import {
  initializePurchasePayment,
  PaymentInitializationError,
} from "@/lib/payment-initialization-service";
import { getPaymentProvider } from "@/lib/payment/payment-provider-factory";
import { getPaymentUrlConfig } from "@/lib/payment/payment-urls";
import {
  PaymentConfigError,
  resolveWaveProviderConfig,
} from "@/lib/payment/payment-config";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requireAuthenticatedAppUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isSocialMutationRateLimited(`subscription-payment:${user.id}`)) {
    return NextResponse.json(
      { error: "Please wait before trying again" },
      { status: 429 },
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  const { id } = await context.params;

  // Resolve server-side configuration FIRST so a misconfigured deployment
  // fails closed (503) before any provider or database mutation.
  let urls;
  try {
    urls = getPaymentUrlConfig();
    if (!urls) {
      return NextResponse.json(
        { error: "Payment is not available" },
        { status: 503 },
      );
    }
    // Validate provider configuration availability without exposing it.
    resolveWaveProviderConfig();
  } catch (error) {
    if (error instanceof PaymentConfigError) {
      // Only emit a static category; even the variable-name detail stays
      // inside the server configuration error and never reaches logs/client.
      console.error("Payment configuration unavailable");
      return NextResponse.json(
        { error: "Payment is not available" },
        { status: 503 },
      );
    }
    // Unexpected configuration/runtime failures are classified without
    // serializing the exception or leaking its message/stack.
    console.error("Payment configuration check failed (internal error)");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  try {
    const result = await initializePurchasePayment(
      user.id,
      id,
      idempotencyKey,
      getPaymentProvider(),
      urls,
    );
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof PaymentInitializationError) {
      const status =
        error.code === "invalid_idempotency_key"
          ? 400
          : error.code === "purchase_not_found"
            ? 404
            : error.code === "purchase_not_eligible" ||
                error.code === "purchase_configuration_invalid" ||
                error.code === "payment_already_requested"
              ? 409
              : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    // Database and runtime exceptions may contain connection/internal data.
    console.error("Payment initialization failed (internal error)");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
