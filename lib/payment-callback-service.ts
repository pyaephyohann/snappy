/**
 * Wave callback verification + guarded fulfillment (S7-B.3).
 *
 * Flow (critical ordering — nothing security-sensitive happens before the
 * signature is verified inside the provider adapter):
 *
 *   raw callback body
 *     → bounded size / content-type checks (route)
 *     → provider.verifyCallback (Wave parsing + HMAC + normalization)
 *     → purchase identification via SERVER-PERSISTED references only
 *     → reference/amount/currency binding checks
 *     → state-machine evaluation (PENDING → SUCCEEDED only)
 *     → guarded internal minting of the S7-A verification capability
 *     → fulfillVerifiedPurchase (atomic: purchase + subscription + Sparks)
 *
 * Security model:
 * - No browser session is involved; the provider authenticates via the
 *   documented HMAC callback signature (constant-time verified inside the
 *   adapter). Unsigned or malformed callbacks never reach fulfillment.
 * - The purchase is identified ONLY by `orderReferenceId` (Wave `order_id`)
 *   and `providerReferenceId` (Wave `paymentRequestId`) — both are values
 *   the SERVER persisted, never user-controlled fields. A callback whose
 *   references do not jointly match one purchase fails closed.
 * - Amount and currency are re-checked against the persisted row; the
 *   callback cannot change what was purchased.
 * - Only the normalized SUCCEEDED outcome enters fulfillment; INSUFFICIENT_
 *   BALANCE and other non-success outcomes never fulfill; unknown statuses
 *   are rejected by the adapter.
 * - Raw Wave payloads never leave the adapter; this service and the route
 *   see only `VerifiedPaymentResult` / persisted rows.
 *
 * Orphan-payment limitation (S7-B.2 interplay, documented and fail-closed):
 * if Wave accepted the payment but the S7-B.2 initialization persistence
 * failed, the purchase is still INITIALIZED with `providerReferenceId =
 * null`. The callback carries a `paymentRequestId` that cannot be matched to
 * any persisted reference, so the callback is REJECTED (not guessed at).
 * Explicit reconciliation (e.g. provider-side query by order reference) is a
 * future milestone; until then such payments cannot fulfill.
 *
 * Replay/concurrency: `fulfillVerifiedPurchase` runs inside one transaction
 * that locks the canonical user row and is idempotent for an already-
 * SUCCEEDED purchase (returns the recorded subscription/grant without
 * re-granting). Concurrent identical callbacks therefore produce exactly one
 * activation, one Spark grant, and one success state.
 *
 * Renewal is deferred to a later milestone and requires an explicit Spark
 * timing rule: a confirmed success against an already-active subscription
 * follows existing S7-A behavior and fails (`subscription_already_active`)
 * rather than stacking a renewal.
 */
import { prisma } from "@/lib/prisma";
import type { SubscriptionPurchase } from "@prisma/client";
import {
  decidePurchaseTransition,
  type PurchaseLifecycleStatus,
} from "@/lib/payment/payment-state";
import type {
  PaymentProvider,
  VerifiedPaymentResult,
} from "@/lib/payment/payment-contract";
import {
  fulfillVerifiedPurchase,
  mintVerifiedPurchasePayment,
} from "@/lib/subscription-purchase-service";

/** Deterministic application outcomes for the callback route. */
export type CallbackOutcome =
  /** Verified, matched, transitioned, and fulfilled (or idempotent replay). */
  | { kind: "fulfilled"; replay: boolean }
  /** Verified and matched, but the outcome does not settle anything
   *  (e.g. INSUFFICIENT_BALANCE — the attempt stays PENDING). */
  | { kind: "acknowledged_no_change" }
  /** Verified but not actionable (unknown purchase, mismatch, illegal
   *  transition, fulfillment rejection). Fail-closed. */
  | { kind: "rejected" };

export class PaymentCallbackError extends Error {
  constructor(
    public readonly code:
      | "malformed_callback"
      | "purchase_not_found"
      | "purchase_reference_mismatch"
      | "purchase_not_eligible"
      | "fulfillment_rejected",
    message: string,
  ) {
    super(message);
    this.name = "PaymentCallbackError";
  }
}

function toLifecycle(status: SubscriptionPurchase["status"]): PurchaseLifecycleStatus {
  return status;
}

/**
 * Handle one raw callback body end-to-end. `rawBody` must be the EXACT bytes
 * received (the signature covers the raw fields).
 */
export async function handleWavePaymentCallback(
  rawBody: string,
  provider: PaymentProvider,
): Promise<CallbackOutcome> {
  // 1) Parse, shape-check, HMAC-verify, normalize — all inside the adapter.
  let verified: VerifiedPaymentResult;
  try {
    verified = await provider.verifyCallback({ rawBody });
  } catch (error) {
    // Invalid signature, malformed body, unknown status, merchant mismatch:
    // all fail closed with a deterministic rejected outcome. The route maps
    // this to 4xx without exposing provider details.
    if (
      error instanceof Error &&
      error.name === "PaymentProviderError"
    ) {
      throw new PaymentCallbackError("malformed_callback", "callback verification failed");
    }
    throw error;
  }

  // 2) Identify the purchase via server-persisted references ONLY. A single
  //    row must match BOTH the order reference and the provider reference.
  const purchase = await prisma.subscriptionPurchase.findFirst({
    where: {
      orderReferenceId: verified.orderReferenceId,
      providerReferenceId: verified.providerReferenceId,
    },
  });
  if (!purchase) {
    // Includes the orphan scenario: Wave accepted, S7-B.2 persistence
    // failed, providerReferenceId is still null → no row can match. Fail
    // closed; never guess. Reconciliation is a future milestone.
    throw new PaymentCallbackError(
      "purchase_not_found",
      "no purchase matches the verified callback references",
    );
  }

  // 3) Merchant reference binding (Wave `merchant_reference_id` was set to
  //    the purchase id at initialization). Mismatch = forged/misrouted.
  if (verified.merchantReferenceId !== purchase.id) {
    throw new PaymentCallbackError(
      "purchase_reference_mismatch",
      "callback merchant reference does not match the purchase",
    );
  }

  // 4) Amount + currency must match the persisted purchase EXACTLY (integer
  //    MMK, strict equality — no rounding, no approximation).
  if (verified.amountMmk !== purchase.amountMmk) {
    throw new PaymentCallbackError(
      "purchase_reference_mismatch",
      "callback amount does not match the purchase",
    );
  }
  if (verified.currency !== purchase.currency) {
    throw new PaymentCallbackError(
      "purchase_reference_mismatch",
      "callback currency does not match the purchase",
    );
  }

  // 5) State machine: decide what this verified outcome does to the row.
  const decision = decidePurchaseTransition(toLifecycle(purchase.status), {
    type: "provider_outcome",
    outcome: verified.status,
  });

  if (decision.action === "reject") {
    // Terminal purchases (CANCELED/EXPIRED/SUCCEEDED-with-mismatch) and
    // impossible transitions (INITIALIZED → SUCCEEDED, outcomes before
    // initialization) fail closed. INITIALIZED specifically: the orphan
    // case above already covers the only realistic path here; see docs.
    throw new PaymentCallbackError(
      "purchase_not_eligible",
      "verified outcome cannot apply to the purchase state",
    );
  }

  if (decision.action === "noop") {
    // Idempotent replay of an already-recorded terminal outcome, or a
    // non-settling outcome (INSUFFICIENT_BALANCE stays PENDING).
    if (verified.status === "SUCCEEDED") {
      // Replay of a confirmed success: re-run fulfillment, which returns the
      // recorded subscription/grant idempotently (no double grant).
      await fulfillVerified(purchase, verified);
      return { kind: "fulfilled", replay: true };
    }
    return { kind: "acknowledged_no_change" };
  }

  // decision.action === "transition".
  if (verified.status === "SUCCEEDED") {
    // PENDING → SUCCEEDED (or FAILED → SUCCEEDED reconciliation, which the
    // S7-A fulfiller currently rejects — fail closed until an explicit
    // product rule exists; documented in docs/spark-economy.md).
    await fulfillVerified(purchase, verified);
    return { kind: "fulfilled", replay: false };
  }

  // Non-success terminal outcomes (FAILED / TIMED_OUT / CANCELED).
  // Persist the transition only if the row is still in the state the
  // decision was made against (guard against concurrent settlement).
  const updated = await prisma.subscriptionPurchase.updateMany({
    where: { id: purchase.id, status: purchase.status },
    data: {
      status: decision.to,
      paymentFailedAt: verified.verifiedAt,
      failureReason: verified.status,
    },
  });
  if (updated.count !== 1) {
    // A concurrent callback changed the state first; its outcome governs.
    return { kind: "acknowledged_no_change" };
  }
  return { kind: "fulfilled", replay: false };
}

/**
 * Internal fulfillment path: mints the module-branded verification from the
 * already-verified provider evidence + the matched persisted purchase, then
 * delegates to S7-A's transactional, idempotent fulfiller. This function is
 * deliberately NOT exported to any client-reachable surface; the brand is
 * unforgeable outside `lib/subscription-purchase-service.ts`.
 */
async function fulfillVerified(
  purchase: SubscriptionPurchase,
  verified: VerifiedPaymentResult,
): Promise<void> {
  const verification = mintVerifiedPurchasePayment({
    purchase: {
      userId: purchase.userId,
      id: purchase.id,
      orderReferenceId: purchase.orderReferenceId,
      amountMmk: purchase.amountMmk,
      currency: purchase.currency,
    },
    verified: {
      providerReferenceId: verified.providerReferenceId,
      orderReferenceId: verified.orderReferenceId,
      amountMmk: verified.amountMmk,
      currency: verified.currency,
      verifiedAt: verified.verifiedAt,
    },
  });
  try {
    await fulfillVerifiedPurchase(purchase.userId, purchase.id, verification);
  } catch (error) {
    // Surface deterministic S7-A rejections (mismatch, not eligible,
    // already active) as fail-closed callback rejections.
    if (error instanceof Error && error.name === "SubscriptionPurchaseServiceError") {
      throw new PaymentCallbackError("fulfillment_rejected", "fulfillment rejected");
    }
    throw error;
  }
}
