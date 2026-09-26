/**
 * Subscription Service (S4 — Subscription Foundation)
 *
 * Server-side authority for subscription state: plan resolution, billing
 * periods, subscription Spark grants, and lifecycle transitions.
 *
 * INTERNAL / SERVICE-LEVEL ONLY. S4 adds no purchase endpoint, checkout,
 * pricing page, or payment flow. `activateSubscription` is the programmatic
 * hook a future payment milestone will call after a successful payment.
 *
 * Concurrency model (mirrors spark-service.ts):
 * - Every mutation first locks the canonical `users` row with
 *   SELECT ... FOR UPDATE, which serializes all per-user economy operations
 *   (spend, grant, activate) in one consistent order (no deadlocks).
 * - Grant identity is deterministic (user + subscription + billing period),
 *   and the ledger's (userId, type, referenceId, sparkKind) unique constraint
 *   is the final backstop. No wall-clock or random identity is ever used for
 *   accounting operations.
 *
 * Expiration model (ledger-safe):
 * - Subscription grants carry `expiresAt = currentPeriodEnd`; balance queries
 *   already exclude expired rows. No expiration transaction is written and no
 *   historical ledger row is ever mutated — expiration is a pure function of
 *   time. `expireDueSubscriptions` only flips the subscription row's status
 *   for bookkeeping.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type {
  PrismaClient,
  Subscription,
  SubscriptionPlan,
} from "@prisma/client";
import {
  DEFAULT_PLAN,
  addBillingMonths,
  getPlanConfig,
  isPaidPlan,
} from "@/lib/subscription-plans";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type SubscriptionError =
  | "invalid_plan"
  | "already_active"
  | "user_not_found"
  | "no_subscription"
  | "subscription_not_active";

export class SubscriptionServiceError extends Error {
  constructor(
    public readonly code: SubscriptionError,
    message: string,
  ) {
    super(message);
    this.name = "SubscriptionServiceError";
  }
}

/** Either the root client or an open interactive transaction. */
type Db = PrismaClient | Prisma.TransactionClient;

const MAX_ACTIVATION_RETRIES = 3;

// ---------------------------------------------------------------------------
// Effective plan resolution
// ---------------------------------------------------------------------------

/**
 * Whether a subscription row currently confers paid-plan benefits.
 *
 * ACTIVE and CANCELED both confer benefits until `currentPeriodEnd`
 * (cancellation is non-renewing, not immediate — no proration in S4).
 * EXPIRED, FREE, and past-period rows confer nothing.
 */
export function isSubscriptionActive(
  subscription: Pick<
    Subscription,
    "plan" | "status" | "currentPeriodEnd"
  > | null,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;
  if (subscription.plan === DEFAULT_PLAN) return false;
  if (subscription.status !== "ACTIVE" && subscription.status !== "CANCELED") {
    return false;
  }
  return subscription.currentPeriodEnd.getTime() > now.getTime();
}

/**
 * The plan whose rules apply to this user right now.
 *
 * A user with no subscription row, an EXPIRED/CANCELED-past-period row, or a
 * FREE row resolves to FREE — there is never an ambiguous state where the
 * application does not know which plan rules apply.
 */
export function resolveEffectivePlan(
  subscription: Pick<Subscription, "plan" | "status" | "currentPeriodEnd"> | null,
  now: Date = new Date(),
): SubscriptionPlan {
  return isSubscriptionActive(subscription, now)
    ? subscription!.plan
    : DEFAULT_PLAN;
}

/** Fetch the user's subscription row (null = implicitly FREE). */
export async function getSubscription(
  userId: string,
  db: Db = prisma,
): Promise<Subscription | null> {
  return db.subscription.findUnique({ where: { userId } });
}

/** Resolve the user's effective plan from the database. */
export async function getEffectivePlan(
  userId: string,
  db: Db = prisma,
  now: Date = new Date(),
): Promise<SubscriptionPlan> {
  const subscription = await getSubscription(userId, db);
  return resolveEffectivePlan(subscription, now);
}

// ---------------------------------------------------------------------------
// Subscription Spark grants (Phase 3–4)
// ---------------------------------------------------------------------------

export interface GrantSubscriptionSparksResult {
  /** True when this call created the grant. */
  granted: boolean;
  /** True when the same billing-period grant already existed (idempotent). */
  idempotent: boolean;
  /** Ledger transaction id of the grant, or null when nothing was granted. */
  transactionId: string | null;
  /** Sparks granted by this call (0 on replay / zero-grant plans). */
  amount: number;
}

/**
 * Deterministic idempotency key for a billing-period grant:
 * subscription identity + billing period start. The same billing-period
 * event always maps to the same accounting operation — never a wall-clock
 * timestamp or a random UUID.
 */
export function subscriptionGrantReference(
  subscriptionId: string,
  periodStart: Date,
): string {
  return `sub-grant:${subscriptionId}:${periodStart.toISOString()}`;
}

/**
 * Grant the plan's subscription Sparks for the subscription's current
 * billing period. Idempotent: the deterministic reference plus the ledger
 * unique constraint guarantee at most one grant per (user, subscription,
 * period), no matter how many times or how concurrently it runs.
 *
 * Must be called inside a Prisma interactive transaction. It acquires the
 * canonical user row lock itself, so it is safe to call standalone (in its
 * own transaction) as well.
 */
export async function grantSubscriptionSparks(
  tx: Prisma.TransactionClient,
  subscription: Subscription,
  now: Date = new Date(),
): Promise<GrantSubscriptionSparksResult> {
  const config = getPlanConfig(subscription.plan);
  if (config.subscriptionSparks <= 0) {
    return { granted: false, idempotent: false, transactionId: null, amount: 0 };
  }

  // Serialize with every other per-user economy operation.
  await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${subscription.userId} FOR UPDATE`;

  const referenceId = subscriptionGrantReference(
    subscription.id,
    subscription.currentPeriodStart,
  );

  const existing = await tx.sparkTransaction.findUnique({
    where: {
      userId_type_referenceId_sparkKind: {
        userId: subscription.userId,
        type: "SUBSCRIPTION_GRANT",
        referenceId,
        sparkKind: "SUBSCRIPTION",
      },
    },
    select: { id: true, amount: true },
  });
  if (existing) {
    return {
      granted: false,
      idempotent: true,
      transactionId: existing.id,
      amount: 0,
    };
  }

  const transaction = await tx.sparkTransaction.create({
    data: {
      userId: subscription.userId,
      amount: config.subscriptionSparks,
      type: "SUBSCRIPTION_GRANT",
      source: "SUBSCRIPTION",
      sparkKind: "SUBSCRIPTION",
      // Subscription Sparks expire at the end of their billing period.
      expiresAt: subscription.currentPeriodEnd,
      referenceType: "subscription",
      referenceId,
      metadata: {
        plan: subscription.plan,
        periodStart: subscription.currentPeriodStart.toISOString(),
        periodEnd: subscription.currentPeriodEnd.toISOString(),
        grantedAt: now.toISOString(),
      },
    },
  });

  return {
    granted: true,
    idempotent: false,
    transactionId: transaction.id,
    amount: config.subscriptionSparks,
  };
}

// ---------------------------------------------------------------------------
// Subscription transitions (Phase 16)
// ---------------------------------------------------------------------------

export interface ActivateSubscriptionInput {
  userId: string;
  /** Paid plan to establish. FREE users are the implicit default — not activatable. */
  plan: SubscriptionPlan;
  /**
   * Deterministic start of the billing period. Defaults to `now`. A future
   * payment integration passes the period that was actually paid for.
   */
  periodStart?: Date;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

export interface ActivateSubscriptionResult {
  subscription: Subscription;
  /** False when an identical, still-active activation was replayed. */
  created: boolean;
  grant: GrantSubscriptionSparksResult;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Establish (or idempotently re-establish) a paid subscription and grant its
 * billing-period Sparks — all in one atomic, serialized operation.
 *
 * S4 semantics (deliberately minimal; upgrades/downgrades/proration are
 * deferred to the payment/subscription-lifecycle milestone):
 * - Free (or expired/absent) → paid plan: creates a fresh billing period and
 *   grants the plan's subscription Sparks exactly once.
 * - Replay of the same activation while active: idempotent (created: false,
 *   no second grant).
 * - Paid plan → different paid plan while active: rejected
 *   (`already_active`). No prorated grants, refunds, or double grants are
 *   invented in S4.
 */
export async function activateSubscription(
  input: ActivateSubscriptionInput,
): Promise<ActivateSubscriptionResult> {
  const { userId, plan } = input;
  const now = input.now ?? new Date();

  if (!isPaidPlan(plan)) {
    throw new SubscriptionServiceError(
      "invalid_plan",
      "only_paid_plans_can_be_activated",
    );
  }

  const periodStart = input.periodStart ?? now;
  const currentPeriodEnd = addBillingMonths(periodStart, 1);

  for (let attempt = 0; attempt < MAX_ACTIVATION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Serialize with all other per-user economy operations.
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (!user) {
          throw new SubscriptionServiceError("user_not_found", "user_not_found");
        }

        const existing = await tx.subscription.findUnique({
          where: { userId },
        });

        if (existing && isSubscriptionActive(existing, now)) {
          if (existing.plan === plan && existing.status === "ACTIVE") {
            // Replay of the same activation: the period grant is idempotent.
            const grant = await grantSubscriptionSparks(tx, existing, now);
            return { subscription: existing, created: false, grant };
          }
          // Different plan (or reactivating a canceled-but-running period):
          // immediate upgrade/downgrade behavior is deferred — never invent
          // prorated Sparks, refunds, or double grants here.
          throw new SubscriptionServiceError(
            "already_active",
            "subscription_already_active",
          );
        }

        const subscription = existing
          ? await tx.subscription.update({
              where: { userId },
              data: {
                plan,
                status: "ACTIVE",
                currentPeriodStart: periodStart,
                currentPeriodEnd,
              },
            })
          : await tx.subscription.create({
              data: {
                userId,
                plan,
                status: "ACTIVE",
                currentPeriodStart: periodStart,
                currentPeriodEnd,
              },
            });

        const grant = await grantSubscriptionSparks(tx, subscription, now);
        return { subscription, created: true, grant };
      });
    } catch (error) {
      // A concurrent activation won a unique-index race. Roll back (fully
      // atomic) and retry so the loser observes the winner's committed state.
      if (isUniqueViolation(error) && attempt < MAX_ACTIVATION_RETRIES - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new SubscriptionServiceError(
    "invalid_plan",
    "subscription_activation_retries_exhausted",
  );
}

/**
 * Cancel the current subscription. Benefits (plan rules + subscription
 * Sparks) continue until `currentPeriodEnd`; renewal stops. No refunds or
 * proration — those are deferred with the payment milestone.
 */
export async function cancelSubscription(
  userId: string,
  now: Date = new Date(),
): Promise<{ subscription: Subscription }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

    const existing = await tx.subscription.findUnique({ where: { userId } });
    if (!existing) {
      throw new SubscriptionServiceError("no_subscription", "no_subscription");
    }
    if (!isSubscriptionActive(existing, now)) {
      throw new SubscriptionServiceError(
        "subscription_not_active",
        "subscription_not_active",
      );
    }

    const subscription = await tx.subscription.update({
      where: { userId },
      data: { status: "CANCELED" },
    });
    return { subscription };
  });
}

/**
 * Mark subscriptions whose billing period has ended as EXPIRED.
 *
 * Pure bookkeeping — idempotent, safe to run repeatedly (cron/job), and it
 * never touches the Spark ledger. Expired subscription Sparks are already
 * unavailable via the `expiresAt` filter regardless of whether this runs.
 */
export async function expireDueSubscriptions(
  now: Date = new Date(),
): Promise<{ expired: number }> {
  const result = await prisma.subscription.updateMany({
    where: {
      status: { in: ["ACTIVE", "CANCELED"] },
      currentPeriodEnd: { lte: now },
      plan: { not: DEFAULT_PLAN },
    },
    data: { status: "EXPIRED" },
  });
  return { expired: result.count };
}
