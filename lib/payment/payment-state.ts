/**
 * Provider-independent purchase state machine (S7-B.1).
 *
 * Pure and deterministic: no Prisma, no I/O, no clock. The status values
 * intentionally mirror `PurchaseStatus` in prisma/schema.prisma so the state
 * machine can be tested without a database (parity is asserted in tests).
 *
 * Transition kinds (kept distinct on purpose):
 * - provider_authoritative — a server-verified provider event (or the
 *   provider accepting payment initialization).
 * - server_timeout        — the server-side TTL expiry sweep.
 * - user_cancellation     — an authenticated user cancels their purchase.
 * - reconciliation        — a late server-verified success after a recorded
 *                           failure (e.g. a timeout later followed by a
 *                           confirmed payment).
 *
 * No client request may transition a purchase to SUCCEEDED: the only event
 * that can reach SUCCEEDED carries a verified provider outcome, which only a
 * server-side provider verifier can produce.
 */
import type { NormalizedPaymentStatus } from "./payment-contract";

export type PurchaseLifecycleStatus =
  | "INITIALIZED"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED";

export type PurchaseTransitionKind =
  | "provider_authoritative"
  | "server_timeout"
  | "user_cancellation"
  | "reconciliation";

export type PurchaseEvent =
  /** Server called the provider and the provider accepted the attempt. */
  | { type: "payment_initiated" }
  /** A server-verified provider callback outcome. */
  | { type: "provider_outcome"; outcome: NormalizedPaymentStatus }
  /** The authenticated owner canceled the purchase. */
  | { type: "user_canceled" }
  /** The server-side TTL expiry rule fired. */
  | { type: "server_timeout" };

export type PurchaseTransitionDecision =
  | {
      action: "transition";
      from: PurchaseLifecycleStatus;
      to: PurchaseLifecycleStatus;
      kind: PurchaseTransitionKind;
    }
  | { action: "noop"; reason: "idempotent_replay" | "non_terminal_outcome" }
  | { action: "reject"; reason: "illegal_transition" | "terminal_state" };

/** Statuses nothing may ever leave (except idempotent repeats). */
export function isTerminalPurchaseStatus(status: PurchaseLifecycleStatus): boolean {
  return status === "SUCCEEDED" || status === "CANCELED" || status === "EXPIRED";
}

function transition(
  from: PurchaseLifecycleStatus,
  to: PurchaseLifecycleStatus,
  kind: PurchaseTransitionKind,
): PurchaseTransitionDecision {
  return { action: "transition", from, to, kind };
}

/**
 * Provider-outcome → target status mapping.
 *
 * - SUCCEEDED            → SUCCEEDED (the only success outcome)
 * - FAILED               → FAILED
 * - CANCELED             → CANCELED
 * - TIMED_OUT            → FAILED    (providers report expired attempts as a
 *                          failed/cancelled transaction; EXPIRED stays
 *                          reserved for the server-side TTL sweep so a late
 *                          verified success can still reconcile)
 * - INSUFFICIENT_BALANCE → no transition (reported as still-pending)
 */
function outcomeTarget(outcome: NormalizedPaymentStatus): PurchaseLifecycleStatus | null {
  switch (outcome) {
    case "SUCCEEDED":
      return "SUCCEEDED";
    case "FAILED":
    case "TIMED_OUT":
      return "FAILED";
    case "CANCELED":
      return "CANCELED";
    case "INSUFFICIENT_BALANCE":
      return null;
    default: {
      const exhaustive: never = outcome;
      throw new Error(`unknown payment outcome: ${String(exhaustive)}`);
    }
  }
}

function decideProviderOutcome(
  current: PurchaseLifecycleStatus,
  outcome: NormalizedPaymentStatus,
): PurchaseTransitionDecision {
  if (outcome === "SUCCEEDED") {
    if (current === "PENDING") {
      return transition(current, "SUCCEEDED", "provider_authoritative");
    }
    if (current === "FAILED") {
      // Late verified confirmation after a recorded failure: reconciliation.
      return transition(current, "SUCCEEDED", "reconciliation");
    }
    // SUCCESS before initialization, or against CANCELED/EXPIRED, is
    // impossible from a legitimate provider flow — reject rather than invent
    // a path.
    return { action: "reject", reason: "illegal_transition" };
  }

  const target = outcomeTarget(outcome);
  if (target === null) {
    // INSUFFICIENT_BALANCE: reported as pending; nothing settles yet.
    return { action: "noop", reason: "non_terminal_outcome" };
  }

  if (current === "INITIALIZED") {
    // No verified provider outcome can exist before initialization.
    return { action: "reject", reason: "illegal_transition" };
  }
  if (current === "PENDING") {
    return transition(current, target, "provider_authoritative");
  }
  if (current === "FAILED") {
    if (target === "FAILED") {
      return { action: "noop", reason: "idempotent_replay" };
    }
    // FAILED can only leave via verified success (reconciliation).
    return { action: "reject", reason: "illegal_transition" };
  }
  return { action: "reject", reason: "terminal_state" };
}

/**
 * Decide the state transition for one event. Pure: same inputs, same output.
 * An `action: "transition"` result is the ONLY way a purchase may change
 * status; callers must persist `to` atomically and only while the stored row
 * still reports `from`.
 */
export function decidePurchaseTransition(
  current: PurchaseLifecycleStatus,
  event: PurchaseEvent,
): PurchaseTransitionDecision {
  if (isTerminalPurchaseStatus(current)) {
    const repeats =
      (current === "SUCCEEDED" &&
        event.type === "provider_outcome" &&
        event.outcome === "SUCCEEDED") ||
      (current === "CANCELED" &&
        (event.type === "user_canceled" ||
          (event.type === "provider_outcome" && event.outcome === "CANCELED"))) ||
      (current === "EXPIRED" && event.type === "server_timeout");
    return repeats
      ? { action: "noop", reason: "idempotent_replay" }
      : { action: "reject", reason: "terminal_state" };
  }

  switch (event.type) {
    case "payment_initiated":
      if (current === "INITIALIZED") {
        return transition(current, "PENDING", "provider_authoritative");
      }
      if (current === "PENDING") {
        return { action: "noop", reason: "idempotent_replay" };
      }
      // FAILED: a new provider attempt would be a new purchase, not a retry
      // of this row — reject.
      return { action: "reject", reason: "illegal_transition" };

    case "user_canceled":
      if (current === "INITIALIZED" || current === "PENDING") {
        return transition(current, "CANCELED", "user_cancellation");
      }
      return { action: "reject", reason: "illegal_transition" };

    case "server_timeout":
      if (current === "PENDING") {
        return transition(current, "EXPIRED", "server_timeout");
      }
      return { action: "reject", reason: "illegal_transition" };

    case "provider_outcome":
      return decideProviderOutcome(current, event.outcome);

    default: {
      const exhaustive: never = event;
      throw new Error(`unknown purchase event: ${String(exhaustive)}`);
    }
  }
}
