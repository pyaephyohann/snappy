/**
 * Provider-independent subscription purchase foundation (S7-A).
 *
 * This module records purchase intents and provides an internal, capability-
 * protected fulfillment boundary for a future server-side verifier. S7-A has
 * no verifier and no public fulfillment route: purchase intent is not payment
 * evidence and cannot activate a subscription.
 */
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  Prisma as PrismaTypes,
  SubscriptionPlan,
  SubscriptionPurchase,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBillingMonths, PAID_PLANS, PLAN_CONFIG } from "@/lib/subscription-plans";
import {
  activateSubscriptionInTransaction,
  isSubscriptionActive,
  subscriptionGrantReference,
  type ActivateSubscriptionResult,
} from "@/lib/subscription-service";

export type PurchaseServiceErrorCode =
  | "invalid_plan"
  | "invalid_idempotency_key"
  | "idempotency_conflict"
  | "purchase_not_found"
  | "subscription_already_active"
  | "payment_verification_required"
  | "payment_verification_mismatch"
  | "purchase_not_eligible";

export class SubscriptionPurchaseServiceError extends Error {
  constructor(public readonly code: PurchaseServiceErrorCode, message: string) {
    super(message);
    this.name = "SubscriptionPurchaseServiceError";
  }
}

const PURCHASE_CURRENCY = "MMK";
const PLAN_CONFIG_VERSION = "1";

export type SafeSubscriptionPurchase = Pick<
  SubscriptionPurchase,
  | "id"
  | "requestedPlan"
  | "amountMmk"
  | "currency"
  | "orderReferenceId"
  | "status"
  | "requestedAt"
  | "paymentInitiatedAt"
  | "paymentSucceededAt"
  | "paymentFailedAt"
  | "canceledAt"
  | "expiresAt"
  | "subscriptionId"
>;

const safePurchaseSelect = {
  id: true,
  requestedPlan: true,
  amountMmk: true,
  currency: true,
  orderReferenceId: true,
  status: true,
  requestedAt: true,
  paymentInitiatedAt: true,
  paymentSucceededAt: true,
  paymentFailedAt: true,
  canceledAt: true,
  expiresAt: true,
  subscriptionId: true,
} satisfies PrismaTypes.SubscriptionPurchaseSelect;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validateIdempotencyKey(value: string): void {
  if (value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new SubscriptionPurchaseServiceError(
      "invalid_idempotency_key",
      "a valid Idempotency-Key header is required",
    );
  }
}

/** Create/replay one owner-scoped purchase intent. No client-controlled money or benefits. */
export async function createPurchase(
  userId: string,
  requestedPlan: SubscriptionPlan,
  idempotencyKey: string,
): Promise<SafeSubscriptionPurchase> {
  if (!PAID_PLANS.includes(requestedPlan)) {
    throw new SubscriptionPurchaseServiceError("invalid_plan", "only paid plans can be purchased");
  }
  validateIdempotencyKey(idempotencyKey);

  const idempotencyKeyHash = digest(`${userId}\u0000${idempotencyKey}`);
  const orderReferenceId = `subpurchase_${idempotencyKeyHash}`;
  const amountMmk = PLAN_CONFIG[requestedPlan].monthlyPriceMmk;

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) {
        throw new SubscriptionPurchaseServiceError("purchase_not_found", "user_not_found");
      }

      const existing = await tx.subscriptionPurchase.findUnique({
        where: { userId_idempotencyKeyHash: { userId, idempotencyKeyHash } },
        select: { ...safePurchaseSelect, requestedPlan: true },
      });
      if (existing) {
        if (existing.requestedPlan !== requestedPlan) {
          throw new SubscriptionPurchaseServiceError(
            "idempotency_conflict",
            "Idempotency-Key was already used for a different plan",
          );
        }
        return existing;
      }

      const subscription = await tx.subscription.findUnique({ where: { userId } });
      if (isSubscriptionActive(subscription)) {
        throw new SubscriptionPurchaseServiceError(
          "subscription_already_active",
          "an active subscription already exists",
        );
      }

      return tx.subscriptionPurchase.create({
        data: {
          userId,
          requestedPlan,
          amountMmk,
          planConfigVersion: PLAN_CONFIG_VERSION,
          currency: PURCHASE_CURRENCY,
          orderReferenceId,
          idempotencyKeyHash,
          status: "INITIALIZED",
        },
        select: safePurchaseSelect,
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await prisma.subscriptionPurchase.findUnique({
      where: { userId_idempotencyKeyHash: { userId, idempotencyKeyHash } },
      select: { ...safePurchaseSelect, requestedPlan: true },
    });
    if (!existing) throw error;
    if (existing.requestedPlan !== requestedPlan) {
      throw new SubscriptionPurchaseServiceError(
        "idempotency_conflict",
        "Idempotency-Key was already used for a different plan",
      );
    }
    return existing;
  }
}

/** Owner-scoped status lookup; never returns provider or idempotency data. */
export async function getPurchase(
  userId: string,
  purchaseId: string,
): Promise<SafeSubscriptionPurchase | null> {
  return prisma.subscriptionPurchase.findFirst({
    where: { id: purchaseId, userId },
    select: safePurchaseSelect,
  });
}

/** Branded server-only verifier evidence; impossible to construct structurally from a client payload. */
const verificationBrand: unique symbol = Symbol("verified-subscription-payment");
export interface VerifiedPurchasePayment {
  readonly [verificationBrand]: true;
  readonly orderReferenceId: string;
  readonly amountMmk: number;
  readonly currency: string;
  readonly verificationReference: string;
  readonly verifiedAt: Date;
  readonly periodStart: Date;
}

/** No verifier is installed in S7-A. Only a future server module should mint this opaque proof. */
export function requirePaymentVerification(): never {
  throw new SubscriptionPurchaseServiceError(
    "payment_verification_required",
    "payment verification required",
  );
}

/**
 * S7-B.3 — the guarded minting entry point anticipated by S7-A.
 *
 * SERVER-ONLY, INTERNAL: callable only from server payment code that has
 * ALREADY (a) cryptographically verified the provider callback signature via
 * the Wave adapter, and (b) matched the normalized result against a persisted
 * purchase by server-side references. It is never reachable from any HTTP
 * request shape: the brand symbol is module-private, so an ordinary client
 * payload cannot structurally satisfy `[verificationBrand]: true`, and no
 * route passes raw callback data here.
 *
 * The caller supplies the persisted purchase identity (userId, purchaseId)
 * found via server-persisted references — the verified provider evidence is
 * bound to that exact purchase row inside `fulfillVerifiedPurchase`, which
 * independently re-validates orderReferenceId/amount/currency against the
 * row before any state change.
 */
export function mintVerifiedPurchasePayment(input: {
  purchase: {
    userId: string;
    id: string;
    orderReferenceId: string;
    amountMmk: number;
    currency: string;
  };
  verified: {
    providerReferenceId: string;
    orderReferenceId: string;
    amountMmk: number;
    currency: string;
    verifiedAt: Date;
  };
}): VerifiedPurchasePayment {
  const { purchase, verified } = input;
  // Defense in depth: the minter itself re-asserts the binding between the
  // verified evidence and the persisted purchase before minting.
  if (
    verified.orderReferenceId !== purchase.orderReferenceId ||
    verified.amountMmk !== purchase.amountMmk ||
    verified.currency !== purchase.currency ||
    !verified.providerReferenceId ||
    !Number.isFinite(verified.verifiedAt.getTime())
  ) {
    throw new SubscriptionPurchaseServiceError(
      "payment_verification_mismatch",
      "verified payment does not match the purchase",
    );
  }
  // The deterministic paid-period start: the moment of server-verified
  // confirmation. fulfillVerifiedPurchase persists it exactly once and
  // replays idempotently on later identical callbacks.
  const periodStart = verified.verifiedAt;
  return {
    [verificationBrand]: true,
    orderReferenceId: purchase.orderReferenceId,
    amountMmk: purchase.amountMmk,
    currency: purchase.currency,
    verificationReference: verified.providerReferenceId,
    verifiedAt: verified.verifiedAt,
    periodStart,
  };
}

export interface FulfillVerifiedPurchaseResult {
  purchase: SafeSubscriptionPurchase;
  activation: ActivateSubscriptionResult;
}

/**
 * Internal-only transactional fulfillment. `verification` is an opaque,
 * module-branded server value, never accepted by an HTTP route. No S7-A code
 * can mint it. Future S7-B must mint it only after independently verifying
 * provider evidence and provide the exact paid-period start once.
 */
export async function fulfillVerifiedPurchase(
  userId: string,
  purchaseId: string,
  verification: VerifiedPurchasePayment,
): Promise<FulfillVerifiedPurchaseResult> {
  if (verification[verificationBrand] !== true) {
    throw new SubscriptionPurchaseServiceError(
      "payment_verification_required",
      "payment verification required",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const purchase = await tx.subscriptionPurchase.findFirst({
      where: { id: purchaseId, userId },
    });
    if (!purchase) {
      throw new SubscriptionPurchaseServiceError("purchase_not_found", "purchase_not_found");
    }

    if (
      purchase.orderReferenceId !== verification.orderReferenceId ||
      purchase.amountMmk !== verification.amountMmk ||
      purchase.currency !== verification.currency ||
      !verification.verificationReference ||
      !Number.isFinite(verification.verifiedAt.getTime()) ||
      !Number.isFinite(verification.periodStart.getTime())
    ) {
      throw new SubscriptionPurchaseServiceError(
        "payment_verification_mismatch",
        "verified payment does not match the purchase",
      );
    }

    if (purchase.status === "SUCCEEDED" && purchase.subscriptionId && purchase.periodStart) {
      if (
        purchase.periodStart.getTime() !== verification.periodStart.getTime() ||
        purchase.providerReferenceId !== verification.verificationReference
      ) {
        throw new SubscriptionPurchaseServiceError(
          "payment_verification_mismatch",
          "verified billing period conflicts with the recorded period",
        );
      }
      const subscription = await tx.subscription.findUnique({ where: { id: purchase.subscriptionId } });
      if (!subscription) {
        throw new SubscriptionPurchaseServiceError("purchase_not_eligible", "linked_subscription_missing");
      }
      const referenceId = subscriptionGrantReference(subscription.id, purchase.periodStart);
      const grantRow = await tx.sparkTransaction.findFirst({
        where: { userId, type: "SUBSCRIPTION_GRANT", referenceId, sparkKind: "SUBSCRIPTION" },
        select: { id: true },
      });
      return {
        purchase: await tx.subscriptionPurchase.findUniqueOrThrow({
          where: { id: purchase.id },
          select: safePurchaseSelect,
        }),
        activation: {
          subscription,
          created: false,
          grant: {
            granted: false,
            idempotent: Boolean(grantRow),
            transactionId: grantRow?.id ?? null,
            amount: 0,
          },
        },
      };
    }

    if (purchase.status !== "PENDING") {
      throw new SubscriptionPurchaseServiceError(
        "purchase_not_eligible",
        "purchase must be pending before verified fulfillment",
      );
    }
    if (purchase.periodStart && purchase.periodStart.getTime() !== verification.periodStart.getTime()) {
      throw new SubscriptionPurchaseServiceError(
        "payment_verification_mismatch",
        "verified billing period conflicts with the recorded period",
      );
    }

    const currentSubscription = await tx.subscription.findUnique({ where: { userId } });
    if (isSubscriptionActive(currentSubscription, verification.verifiedAt)) {
      throw new SubscriptionPurchaseServiceError(
        "subscription_already_active",
        "an active subscription already exists",
      );
    }

    // `periodStart` is persisted in the same transaction and reused on replay.
    const periodStart = purchase.periodStart ?? verification.periodStart;
    if (addBillingMonths(periodStart, 1).getTime() <= verification.verifiedAt.getTime()) {
      throw new SubscriptionPurchaseServiceError(
        "payment_verification_mismatch",
        "verified billing period has already ended",
      );
    }
    const activation = await activateSubscriptionInTransaction(tx, {
      userId,
      plan: purchase.requestedPlan,
      periodStart,
      now: verification.verifiedAt,
    });
    const updated = await tx.subscriptionPurchase.update({
      where: { id: purchase.id },
      data: {
        status: "SUCCEEDED",
        paymentSucceededAt: verification.verifiedAt,
        providerReferenceId: verification.verificationReference,
        periodStart,
        subscriptionId: activation.subscription.id,
        failureReason: null,
      },
      select: safePurchaseSelect,
    });
    return { purchase: updated, activation };
  });
}

/**
 * Deterministic server-side order id from owner + idempotency hash, exported
 * only to support source-level tests and stable diagnostics.
 */
export function purchaseOrderReference(userId: string, idempotencyKey: string): string {
  return `subpurchase_${digest(`${userId}\u0000${idempotencyKey}`)}`;
}

/** Deliberately inert client-facing service boundary; no request can mark payment successful. */
export async function fulfillPurchase(): Promise<never> {
  return requirePaymentVerification();
}

