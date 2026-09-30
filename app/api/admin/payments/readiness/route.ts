/**
 * GET /api/admin/payments/readiness — payment CONFIGURATION readiness probe.
 *
 * Semantic contract (S8.3 clarification) — `ready: true` means exactly one
 * thing: the server-side payment configuration is INTERNALLY VALID and the
 * deployment configuration is READY TO BE CHECKED. Nothing more.
 *
 * `ready` does NOT mean, and must never be read as:
 * - Wave merchant approval has been granted;
 * - the Wave credentials are valid or accepted by Wave;
 * - the deployment is reachable from the public internet (this probe runs
 *   inside that deployment, so it cannot observe its own reachability);
 * - callback delivery has been verified (no provider callback is involved);
 * - a sandbox payment has succeeded;
 * - production is ready for real payments.
 *
 * Those remain separate operational gates that require provider/account access.
 * This is a diagnostic only: it cannot initialize, verify, or fulfill anything.
 *
 * Security properties (all deliberate):
 * - ADMIN-ONLY: gated by the existing admin session (`requireAdminApi`), so it
 *   is not an unauthenticated recon surface.
 * - CONFIGURATION-ONLY, NO SIDE EFFECTS: it never contacts Wave, never reads
 *   the database, and never mutates payment state. It only evaluates the
 *   existing server-side configuration resolvers.
 * - NO SECRETS: the response carries booleans and safe category strings only.
 *   It never returns credential material, provider payloads, configuration
 *   values, or the offending variable names — mirroring the payment routes,
 *   which keep configuration detail server-side.
 * - NO-STORE: responses are private and uncacheable.
 *
 * Response (200 when the configuration is internally valid and checkable,
 * 503 when it is not — see the semantic contract above):
 *   {
 *     ready, // configuration validity only — NOT operational approval
 *     provider, environment,
 *     checks: { paymentConfigResolved, publicOriginResolved,
 *               callbackUrlResolved, callbackPathValid,
 *               frontendReturnPathValid },
 *     callback: { path, host },
 *     issues: string[],   // safe categories only
 *     mode: "configuration-only"
 *   }
 */
import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdminApi } from "@/lib/admin-api";
import {
  PaymentConfigError,
  resolveWaveProviderConfig,
} from "@/lib/payment/payment-config";
import { getPaymentUrlConfig } from "@/lib/payment/payment-urls";

/** The signed provider callback route the deployment must advertise. */
const EXPECTED_CALLBACK_PATH = "/api/payments/wave/callback";
/** The browser return surface (navigation only, never proof of payment). */
const EXPECTED_FRONTEND_RETURN_PATH = "/subscription/checkout/return";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  try {
    await requireAdminApi();
  } catch (error) {
    const authResponse = adminErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Payment readiness probe failed (internal error)");
    return NextResponse.json(
      { error: "Failed to evaluate payment readiness" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const issues: string[] = [];

  // 1) Provider configuration: presence + validity + environment/endpoint
  //    pairing, all via the existing S7 resolver. Errors are classified, never
  //    serialized (they carry variable names, which stay server-side).
  let provider: "wavepay" | null = null;
  let environment: "test" | "production" | null = null;
  let paymentConfigResolved = false;
  try {
    const config = resolveWaveProviderConfig();
    provider = config.providerId;
    environment = config.environment;
    paymentConfigResolved = true;
  } catch (error) {
    issues.push(
      error instanceof PaymentConfigError
        ? "payment_configuration_unavailable"
        : "payment_configuration_error",
    );
  }

  // 2) Public URL resolution: HTTPS origin for the callback + return URLs.
  let publicOriginResolved = false;
  let callbackUrlResolved = false;
  let callbackPathValid = false;
  let frontendReturnPathValid = false;
  let callbackHost: string | null = null;
  try {
    const urls = getPaymentUrlConfig();
    if (urls) {
      publicOriginResolved = true;
      const callback = new URL(urls.backendCallbackUrl);
      const frontendReturn = new URL(urls.frontendReturnUrl);
      // Host only — no query, credentials, or extra path detail.
      callbackHost = callback.host;
      callbackUrlResolved = true;
      callbackPathValid = callback.pathname === EXPECTED_CALLBACK_PATH;
      frontendReturnPathValid =
        frontendReturn.pathname === EXPECTED_FRONTEND_RETURN_PATH;
    } else {
      issues.push("public_origin_unavailable");
    }
  } catch {
    issues.push("public_origin_error");
  }

  if (publicOriginResolved && callbackUrlResolved && !callbackPathValid) {
    issues.push("callback_path_mismatch");
  }
  if (publicOriginResolved && !frontendReturnPathValid) {
    issues.push("frontend_return_path_mismatch");
  }

  // `ready` asserts internal configuration validity only (see the semantic
  // contract at the top of this file). It deliberately does NOT assert Wave
  // merchant approval, credential acceptance, deployment reachability,
  // callback delivery, or any completed sandbox/production payment.
  const ready =
    paymentConfigResolved &&
    publicOriginResolved &&
    callbackUrlResolved &&
    callbackPathValid &&
    frontendReturnPathValid;

  return NextResponse.json(
    {
      ready,
      provider,
      environment,
      checks: {
        paymentConfigResolved,
        publicOriginResolved,
        callbackUrlResolved,
        callbackPathValid,
        frontendReturnPathValid,
      },
      callback: { path: EXPECTED_CALLBACK_PATH, host: callbackHost },
      issues,
      mode: "configuration-only",
    },
    { status: ready ? 200 : 503, headers: NO_STORE_HEADERS },
  );
}
