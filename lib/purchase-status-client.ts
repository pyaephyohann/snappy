/**
 * Client-safe purchase status primitives (S7-B.4).
 *
 * Shared by the Spark plan purchase flow and the checkout return page so
 * both surfaces observe purchase state through exactly one path:
 * the owner-scoped `GET /api/subscription/purchases/[id]` endpoint.
 *
 * SERVER-AUTHORITATIVE: everything here only OBSERVES purchase state. No
 * function in this module can transition a purchase, and success is only
 * ever reported when the SERVER reports `SUCCEEDED`. Provider redirect
 * query parameters are never read, parsed, or trusted anywhere in this
 * module — a browser return is navigation context only.
 *
 * The wire shape mirrors the server's `SafeSubscriptionPurchase` subset the
 * UI renders; it is re-declared here because the server type lives in a
 * Prisma-importing module that must never reach the client bundle.
 */
import type { PurchaseStatus, SubscriptionPlan } from "@prisma/client";

export type PurchaseSnapshot = {
  id: string;
  requestedPlan: SubscriptionPlan;
  amountMmk: number;
  currency: string;
  status: PurchaseStatus;
  expiresAt: string | null;
};

/** How the status lookup failed. `network` may be transient; the others are not. */
export type PurchaseStatusError = "unauthorized" | "not_found" | "network";

export type PurchaseFetchResult =
  | { kind: "ok"; purchase: PurchaseSnapshot }
  | { kind: PurchaseStatusError };

/** Poll cadence: frequent enough to feel live, gentle enough not to hammer. */
export const PURCHASE_POLL_INTERVAL_MS = 3_000;

/**
 * Bounded polling window (8 minutes, inside the 5–10 minute guidance).
 * Wave payment sessions expire well within this window, and the server is
 * the authority on expiry regardless — the window only bounds how long the
 * client keeps asking.
 */
export const PURCHASE_POLL_WINDOW_MS = 8 * 60 * 1000;

/**
 * Statuses that end client polling. `FAILED` is included even though the
 * server lifecycle may reconcile a late success later: the client simply
 * stops asking and renders the neutral server-reported state.
 */
export function isPollingTerminalStatus(status: PurchaseStatus): boolean {
  return (
    status === "SUCCEEDED" ||
    status === "FAILED" ||
    status === "CANCELED" ||
    status === "EXPIRED"
  );
}

/**
 * Neutral, user-safe copy for each server-reported status. Nothing here
 * infers failure from timeouts, network errors, or page closes — a state
 * is only ever described when the server reported it.
 */
export function describePurchaseStatus(status: PurchaseStatus): string {
  switch (status) {
    case "SUCCEEDED":
      return "Payment confirmed — your subscription is active.";
    case "FAILED":
      return "Payment was not completed successfully.";
    case "CANCELED":
      return "Payment was canceled.";
    case "EXPIRED":
      return "Payment session expired.";
    case "PENDING":
      return "Payment is still being processed.";
    case "INITIALIZED":
      return "Your payment is still being prepared.";
    default: {
      const exhaustive: never = status;
      return `Purchase status: ${String(exhaustive)}`;
    }
  }
}

/**
 * Validate a server-provided payment URL before any browser navigation.
 * Only absolute http(s) URLs ever leave the app; anything else (relative,
 * javascript:, data:, …) is refused and simply never opened. The URL is
 * never rendered as HTML — only used for navigation.
 */
export function toSafePaymentUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

function isPurchaseSnapshot(value: unknown): value is PurchaseSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.requestedPlan === "string" &&
    typeof record.amountMmk === "number" &&
    typeof record.currency === "string" &&
    typeof record.status === "string"
  );
}

/**
 * Session-scoped marker of an in-flight purchase so a refresh (or a tab
 * returning from the provider) can resume observing the SAME purchase
 * instead of creating a second one. It holds only an id to look up on the
 * server — never a status — and is dropped once the polling window passes.
 */
const ACTIVE_PURCHASE_STORAGE_KEY = "snappy:active-purchase";

export function readActivePurchaseId(): string | null {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_PURCHASE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown; startedAt?: unknown };
    if (typeof parsed.id !== "string" || typeof parsed.startedAt !== "number") {
      return null;
    }
    if (Date.now() - parsed.startedAt > PURCHASE_POLL_WINDOW_MS) {
      // Stale marker: drop it silently rather than resuming a dead flow.
      window.sessionStorage.removeItem(ACTIVE_PURCHASE_STORAGE_KEY);
      return null;
    }
    return parsed.id;
  } catch {
    return null;
  }
}

export function writeActivePurchaseId(id: string): void {
  try {
    window.sessionStorage.setItem(
      ACTIVE_PURCHASE_STORAGE_KEY,
      JSON.stringify({ id, startedAt: Date.now() }),
    );
  } catch {
    // Storage unavailable — the flow still works without refresh recovery.
  }
}

export function clearActivePurchaseId(): void {
  try {
    window.sessionStorage.removeItem(ACTIVE_PURCHASE_STORAGE_KEY);
  } catch {
    // Nothing to clean up.
  }
}

/**
 * Owner-scoped status lookup — the SOLE source of truth for client payment
 * state. Auth comes from the session cookie; the client never supplies any
 * money, reference, or provider field.
 */
export async function fetchPurchaseStatus(
  purchaseId: string,
  signal?: AbortSignal,
): Promise<PurchaseFetchResult> {
  try {
    const response = await fetch(
      `/api/subscription/purchases/${encodeURIComponent(purchaseId)}`,
      {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal,
      },
    );
    if (response.status === 401) return { kind: "unauthorized" };
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok) return { kind: "network" };
    const data = (await response.json()) as { purchase?: unknown };
    if (!isPurchaseSnapshot(data.purchase)) return { kind: "network" };
    return { kind: "ok", purchase: data.purchase };
  } catch {
    // Includes aborts: callers stop caring about results once aborted.
    return { kind: "network" };
  }
}
