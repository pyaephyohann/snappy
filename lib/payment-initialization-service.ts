/**
 * Secure, idempotent payment initialization for an existing
 * `SubscriptionPurchase` (S7-B.2).
 *
 * Connects the S7-A purchase foundation to the provider-neutral
 * `PaymentProvider` contract (S7-B.1). This module does NOT implement
 * webhook/callback routes, fulfillment, refunds, or auto-renewal — the only
 * thing it can ever do is move INITIALIZED → PENDING and persist the
 * provider reference of an accepted initialization.
 *
 * Security model:
 * - Every payment-critical value (amount, currency, order reference, plan,
 *   description) is derived from the persisted purchase row — never from any
 *   client input.
 * - The caller must already be the authenticated owner (`purchase.userId`
 *   is asserted against the session user id; cross-user access is rejected
 *   with the same opaque error as a missing purchase).
 * - The provider adapter receives a server-created domain object
 *   (`CreatePaymentInput`); this layer never touches provider payloads.
 *
 * Idempotency + concurrency design (why no new schema field is needed):
 * - One purchase row represents at most ONE logical payment attempt
 *   (`orderReferenceId` is unique per purchase, and Wave's `order_id` /
 *   `merchant_reference_id` pair is deterministic from the purchase row).
 * - The whole flow serializes on the canonical `users` row lock
 *   (`SELECT ... FOR UPDATE`, mirroring spark-service.ts), so two
 *   concurrent initializations cannot both observe INITIALIZED.
 * - The state machine (`decidePurchaseTransition`) only permits
 *   `payment_initiated` from INITIALIZED; a PENDING replay is a noop.
 * - Wave rejects a replayed `(order_id, merchant_reference_id)` with 409,
 *   which maps to `payment_already_requested` — so even a lost race cannot
 *   silently create a second provider payment for one purchase.
 * - Provider creation happens OUTSIDE any database transaction (an external
 *   HTTP call cannot roll back). The purchase row transitions to PENDING
 *   only AFTER the provider accepted, and the persisted
 *   `providerReferenceId` (unique) is the durable record of the attempt. If
 *   the process dies between provider acceptance and persistence, the
 *   purchase stays INITIALIZED, a retry re-hits Wave's 409 for the same
 *   deterministic reference, and recovery/reconciliation is deferred to
 *   S7-B.3 (documented, fail-closed).
 *
 * PENDING semantics: a PENDING purchase with a stored provider reference is
 * returned as-is (safe replay of the same payment, never a duplicate); a
 * PENDING purchase WITHOUT a reference is an inconsistent intermediate state
 * (e.g. crash after transition before reference persistence — impossible in
 * this flow, defensive only) and fails closed.
 *
 * Timeout/recovery: a provider timeout is a `transport_error`, NOT success.
 * The purchase stays INITIALIZED. Because Wave binds payments to the
 * deterministic `(order_id, merchant_reference_id)`, a later retry cannot
 * create a second payment; explicit reconciliation is S7-B.3.
 */
import { prisma } from "@/lib/prisma";
import type { SubscriptionPurchase } from "@prisma/client";
import { PLAN_CONFIG } from "@/lib/subscription-plans";
import { getPlanLabel } from "@/lib/subscription-plan-labels";
import {
  decidePurchaseTransition,
  type PurchaseLifecycleStatus,
} from "@/lib/payment/payment-state";
import {
  PaymentProviderError,
  type CreatePaymentInput,
  type PaymentProvider,
} from "@/lib/payment/payment-contract";
import { WAVE_MAX_TTL_SECONDS } from "@/lib/payment/wave-payment-provider";

export type PaymentInitializationErrorCode =
  | "purchase_not_found"
  | "invalid_idempotency_key"
  | "purchase_not_eligible"
  | "purchase_configuration_invalid"
  | "payment_provider_unavailable"
  | "payment_provider_error"
  | "payment_already_requested";

export class PaymentInitializationError extends Error {
  constructor(
    public readonly code: PaymentInitializationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentInitializationError";
  }
}

/** Provider-neutral, client-safe result of payment initialization. */
export interface SafePaymentInitialization {
  purchaseId: string;
  status: "PENDING";
  paymentUrl: string | null;
  expiresAt: string;
}

/** The Idempotency-Key header is validated with the S7-A rules. */
export function validatePaymentIdempotencyKey(value: string): void {
  if (value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new PaymentInitializationError(
      "invalid_idempotency_key",
      "a valid Idempotency-Key header is required",
    );
  }
}

function toLifecycle(status: SubscriptionPurchase["status"]): PurchaseLifecycleStatus {
  return status;
}

/**
 * Verify that a persisted purchase still matches the CURRENT server-side plan
 * configuration semantics (plan integrity check). The stored amount is never
 * overwritten; an impossible configuration fails closed.
 */
function assertPurchaseConfigurationIntegrity(purchase: SubscriptionPurchase): void {
  // PLAN_CONFIG is the authoritative per-plan product table; a persisted
  // purchase for a plan that no longer exists in it is impossible under
  // normal operation and fails closed here.
  if (!(purchase.requestedPlan in PLAN_CONFIG)) {
    throw new PaymentInitializationError(
      "purchase_configuration_invalid",
      "purchase references an unknown plan",
    );
  }
  if (purchase.requestedPlan === "FREE" || purchase.amountMmk <= 0) {
    throw new PaymentInitializationError(
      "purchase_configuration_invalid",
      "purchase amount is not a valid paid amount",
    );
  }
  if (purchase.planConfigVersion !== "1") {
    throw new PaymentInitializationError(
      "purchase_configuration_invalid",
      "purchase plan configuration version is not current",
    );
  }
  if (purchase.currency !== "MMK") {
    throw new PaymentInitializationError(
      "purchase_configuration_invalid",
      "purchase currency is not supported",
    );
  }
}

/**
 * Initialize (or safely replay) the provider payment for one owned purchase.
 *
 * `userId` comes from the authenticated session — never from the client.
 * `idempotencyKey` is the client-generated `Idempotency-Key` header; it is
 * validated for format but does NOT participate in purchase identity (the
 * purchase id in the URL does that).
 */
export async function initializePurchasePayment(
  userId: string,
  purchaseId: string,
  idempotencyKey: string,
  provider: PaymentProvider,
  urls: { backendCallbackUrl: string; frontendReturnUrl: string },
): Promise<SafePaymentInitialization> {
  validatePaymentIdempotencyKey(idempotencyKey);

  // Serialize all per-user economy/payment operations on the canonical user
  // row, then evaluate state + persist under the lock.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const purchase = await tx.subscriptionPurchase.findFirst({
      where: { id: purchaseId, userId },
    });
    if (!purchase) {
      // Opaque: a cross-user purchase is indistinguishable from a missing one.
      throw new PaymentInitializationError("purchase_not_found", "purchase not found");
    }

    assertPurchaseConfigurationIntegrity(purchase);

    const current = toLifecycle(purchase.status);
    const decision = decidePurchaseTransition(current, { type: "payment_initiated" });

    if (decision.action === "reject") {
      // Terminal (SUCCEEDED/CANCELED/EXPIRED) and illegal (FAILED) states all
      // reject deterministically — terminal purchases are never reopened.
      throw new PaymentInitializationError(
        "purchase_not_eligible",
        "purchase is not eligible for payment initialization",
      );
    }

    if (decision.action === "noop") {
      // PENDING replay: return the EXISTING provider payment when it is
      // safely identifiable — never create a duplicate.
      if (purchase.providerReferenceId) {
        return {
          purchaseId: purchase.id,
          status: "PENDING",
          paymentUrl: null,
          expiresAt: (purchase.expiresAt ?? new Date(0)).toISOString(),
        };
      }
      throw new PaymentInitializationError(
        "purchase_not_eligible",
        "purchase is pending without a provider payment reference",
      );
    }

    // decision.action === "transition" (INITIALIZED → PENDING), but nothing
    // is persisted until the provider ACCEPTS the attempt.
    const now = new Date();
    const expiresAt = new Date(now.getTime() + WAVE_MAX_TTL_SECONDS * 1000);

    const input: CreatePaymentInput = {
      purchaseId: purchase.id,
      orderReferenceId: purchase.orderReferenceId,
      amountMmk: purchase.amountMmk,
      currency: purchase.currency,
      expiresAt,
      backendCallbackUrl: urls.backendCallbackUrl,
      frontendReturnUrl: urls.frontendReturnUrl,
      paymentDescription: getPlanLabel(purchase.requestedPlan),
    };

    let result;
    try {
      result = await provider.createPayment(input);
    } catch (error) {
      if (error instanceof PaymentProviderError && error.code === "duplicate_request") {
        // Wave already holds a payment request for this deterministic
        // (order_id, merchant_reference_id). Fail closed: the existing
        // provider payment's redirect URL is not recoverable without the
        // S7-B.3 reconciliation, so we do NOT guess or re-create.
        throw new PaymentInitializationError(
          "payment_already_requested",
          "a payment request already exists for this purchase",
        );
      }
      // Transport timeout/network failure/provider rejection: fail closed.
      // The purchase stays INITIALIZED (nothing was persisted); a retry
      // re-uses the same deterministic provider reference semantics.
      throw new PaymentInitializationError(
        "payment_provider_error",
        "payment provider rejected or could not be reached",
      );
    }

    // The provider accepted (NOT paid). Persist the transition atomically,
    // guarded by the state the lock guaranteed.
    const updated = await tx.subscriptionPurchase.updateMany({
      where: { id: purchase.id, status: "INITIALIZED" },
      data: {
        status: "PENDING",
        providerReferenceId: result.providerReferenceId,
        paymentInitiatedAt: now,
        expiresAt: result.expiresAt,
        failureReason: null,
      },
    });
    if (updated.count !== 1) {
      // Should be impossible under the user-row lock; fail closed rather
      // than overwrite an unexpected concurrent transition.
      throw new PaymentInitializationError(
        "purchase_not_eligible",
        "purchase changed state during initialization",
      );
    }

    return {
      purchaseId: purchase.id,
      status: "PENDING",
      paymentUrl: result.paymentUrl,
      expiresAt: result.expiresAt.toISOString(),
    };
  });
}
