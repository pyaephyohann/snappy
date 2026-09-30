"use client";

/**
 * Spark plan purchase flow (S7-B.4).
 *
 * Connects the S6 plan cards to the locked S7-A/S7-B.2 APIs:
 *
 *   choose plan → POST /api/subscription/purchases        (plan id only)
 *              → POST /api/subscription/purchases/[id]/payment  (no body)
 *              → open the server-provided payment URL safely
 *              → observe GET /api/subscription/purchases/[id]   (polling)
 *
 * The client is an OBSERVER of payment state, never an authority:
 * - it never sends money fields (the server derives the amount from
 *   PLAN_CONFIG), provider references, or any provider parameter;
 * - it can never mark a payment SUCCEEDED — success is displayed only
 *   when the server reports SUCCEEDED;
 * - browser returns and payment URL query parameters are never read as
 *   payment results (navigation context only — see the checkout return
 *   page for the browser-return surface);
 * - it performs no local plan or Spark arithmetic — after success it
 *   re-fetches the server-backed Spark usage through the standard
 *   `snappy:spark-usage-updated` refresh event and `router.refresh()`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { SPARK_USAGE_UPDATED_EVENT } from "@/hooks/useSparkUsage";
import { usePurchaseStatus } from "@/hooks/usePurchaseStatus";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import {
  clearActivePurchaseId,
  describePurchaseStatus,
  readActivePurchaseId,
  toSafePaymentUrl,
  writeActivePurchaseId,
  type PurchaseSnapshot,
} from "@/lib/purchase-status-client";

export type PurchasePhase =
  | "idle"
  | "creating_purchase"
  | "initializing_payment"
  | "waiting_for_payment"
  | "success"
  | "failed"
  | "canceled"
  | "expired"
  | "still_processing";

type FlowStep =
  | "idle"
  | "creating"
  | "initializing"
  | "tracking"
  | "client_error";

export type SparkPlanPurchaseFlowState = {
  phase: PurchasePhase;
  /** Server-reported purchase (the price shown comes from here). */
  purchase: PurchaseSnapshot | null;
  /** User-safe copy for the current state. */
  message: string | null;
  /** A purchase or payment request is in flight, or payment is pending. */
  busy: boolean;
  /** The last client-side failure has a safe retry path. */
  retryable: boolean;
  start: (plan: SubscriptionPlan) => void;
  retry: () => void;
  checkStatus: () => void;
  dismiss: () => void;
};

const PURCHASES_ENDPOINT = "/api/subscription/purchases";

/** Unpredictable per-attempt keys; never derived from user data. */
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `snappy-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useSparkPlanPurchase(): SparkPlanPurchaseFlowState {
  const router = useRouter();
  const { openExternalLink } = useTelegramWebApp();
  const [step, setStep] = useState<FlowStep>("idle");
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<PurchaseSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const inFlightRef = useRef(false);
  const attemptRef = useRef<{ plan: SubscriptionPlan; key: string } | null>(null);
  const successFiredRef = useRef(false);
  const status = usePurchaseStatus(trackedId);

  // Note: beginTracking deliberately keeps any transitional notice set by
  // its caller (e.g. "we couldn't open the payment window") — clearing it
  // here would wipe the message in the same React batch.
  const beginTracking = useCallback((id: string) => {
    writeActivePurchaseId(id);
    setRetryable(false);
    setTrackedId(id);
    setStep("tracking");
  }, []);

  // Refresh recovery: resume observing the same purchase (never a new one)
  // when a refresh interrupted an active flow, but only within the polling
  // window — a stale marker is dropped silently. The client-only storage
  // read is deferred one microtask (never a synchronous cascading render);
  // unmounting before it runs is a no-op.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const storedId = readActivePurchaseId();
      if (!storedId) return;
      setTrackedId(storedId);
      setStep("tracking");
    });
    return () => {
      active = false;
    };
  }, []);

  const initializePayment = useCallback(
    async (target: PurchaseSnapshot) => {
      setStep("initializing");
      setNotice(null);
      try {
        // The purchase id (URL) plus an Idempotency-Key header are all this
        // endpoint accepts — no body, no money fields, no provider data.
        const response = await fetch(
          `${PURCHASES_ENDPOINT}/${encodeURIComponent(target.id)}/payment`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Idempotency-Key": newIdempotencyKey() },
          },
        );
        if (response.ok) {
          const data = (await response.json()) as {
            paymentUrl?: string | null;
          };
          const safeUrl = toSafePaymentUrl(data.paymentUrl);
          if (safeUrl) {
            // Safe navigation only: http(s) URL, new tab / Telegram link
            // opener — never injected or rendered as HTML.
            openExternalLink(safeUrl);
            beginTracking(target.id);
            return;
          }
          if (data.paymentUrl) {
            // The server returned a URL this client refuses to navigate to.
            setNotice(
              "We couldn't open the payment window automatically. We'll still confirm your payment status here.",
            );
            beginTracking(target.id);
            return;
          }
          // Replay without a recoverable URL: the payment is already in
          // progress; observation is the only honest path.
          setNotice(
            "Your payment is already being processed. We'll confirm the status here automatically.",
          );
          beginTracking(target.id);
          return;
        }
        if (response.status === 409) {
          // Not eligible or already requested: observe the server state
          // instead of guessing — the status endpoint stays authoritative.
          setNotice(
            "We couldn't open a new payment session. We'll confirm your payment status here instead.",
          );
          beginTracking(target.id);
          return;
        }
        if (response.status === 401) {
          setNotice("Please sign in again to continue.");
        } else if (response.status === 404) {
          setNotice("We couldn't find that purchase. Please try again.");
        } else if (response.status === 503) {
          setNotice("Payments aren't available right now. Please try again later.");
        } else {
          setNotice(
            "We couldn't confirm the payment setup. Please try again.",
          );
        }
        setRetryable(true);
        setStep("client_error");
      } catch {
        // Network failure of unknown outcome: never claim failure. The
        // purchase id is preserved so a retry reuses the same purchase.
        setNotice(
          "We couldn't confirm the payment status right now. Please try again.",
        );
        setRetryable(true);
        setStep("client_error");
      }
    },
    [beginTracking, openExternalLink],
  );

  const createPurchase = useCallback(
    async (plan: SubscriptionPlan, idempotencyKey: string) => {
      setStep("creating");
      setNotice(null);
      try {
        // Only the plan id travels to the server — the amount is derived
        // there from PLAN_CONFIG and is never a client value.
        const response = await fetch(PURCHASES_ENDPOINT, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ plan }),
        });
        if (response.ok) {
          const data = (await response.json()) as { purchase?: PurchaseSnapshot };
          if (!data.purchase?.id) {
            setNotice(
              "We couldn't confirm the payment status right now. Please try again.",
            );
            setRetryable(true);
            setStep("client_error");
            return;
          }
          setPurchase(data.purchase);
          await initializePayment(data.purchase);
          return;
        }
        if (response.status === 401) {
          setNotice("Please sign in again to continue.");
          setRetryable(false);
        } else if (response.status === 409) {
          setNotice(
            "You already have an active subscription, so this plan isn't available right now.",
          );
          setRetryable(false);
        } else if (response.status === 400) {
          setNotice("That plan isn't available for purchase right now.");
          setRetryable(false);
        } else {
          setNotice(
            "Something went wrong while starting your purchase. Please try again.",
          );
          setRetryable(true);
        }
        setStep("client_error");
      } catch {
        // Unknown outcome: the SAME idempotency key is kept so a retry
        // replays this attempt instead of creating a duplicate purchase.
        setNotice(
          "We couldn't reach Snappy. Please check your connection and try again.",
        );
        setRetryable(true);
        setStep("client_error");
      }
    },
    [initializePayment],
  );

  const start = useCallback(
    (plan: SubscriptionPlan) => {
      // FREE is never purchasable; the server enforces the same rule.
      if (plan === "FREE") return;
      // Double-submit guard: repeated taps and re-renders cannot start a
      // second purchase or a second payment request.
      if (inFlightRef.current) return;
      if (step === "creating" || step === "initializing" || step === "tracking") {
        return;
      }
      inFlightRef.current = true;
      successFiredRef.current = false;
      const previous = attemptRef.current;
      // A retry of the same failed creation reuses its idempotency key so
      // an interrupted request can never become two purchases.
      const key =
        previous && previous.plan === plan && !purchase
          ? previous.key
          : newIdempotencyKey();
      attemptRef.current = { plan, key };
      void createPurchase(plan, key).finally(() => {
        inFlightRef.current = false;
      });
    },
    [createPurchase, purchase, step],
  );

  const retry = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    successFiredRef.current = false;
    const attempt = attemptRef.current;
    void (async () => {
      if (purchase) {
        // Payment initialization failed for a known purchase: retrying the
        // initialization is state-machine safe server-side.
        await initializePayment(purchase);
        return;
      }
      if (attempt) {
        await createPurchase(attempt.plan, attempt.key);
        return;
      }
    })().finally(() => {
      inFlightRef.current = false;
    });
  }, [createPurchase, initializePayment, purchase]);

  const checkStatus = useCallback(() => {
    status.checkNow();
  }, [status]);

  const dismiss = useCallback(() => {
    clearActivePurchaseId();
    attemptRef.current = null;
    successFiredRef.current = false;
    setTrackedId(null);
    setPurchase(null);
    setNotice(null);
    setRetryable(false);
    setStep("idle");
  }, []);

  const current = status.purchase?.status;
  const phase: PurchasePhase =
    step === "creating"
      ? "creating_purchase"
      : step === "initializing"
        ? "initializing_payment"
        : step === "tracking"
          ? current === "SUCCEEDED"
            ? "success"
            : current === "FAILED"
              ? "failed"
              : current === "CANCELED"
                ? "canceled"
                : current === "EXPIRED"
                  ? "expired"
                  : status.stillProcessing
                    ? "still_processing"
                    : "waiting_for_payment"
          : step === "client_error"
            ? "failed"
            : "idle";

  // Terminal outcomes are settled: drop the refresh marker, and on server
  // SUCCEEDED refresh the server-backed Spark/profile data (never local math).
  const terminal = phase === "success" || phase === "failed" || phase === "canceled" || phase === "expired";
  useEffect(() => {
    if (!terminal) return;
    clearActivePurchaseId();
    if (phase === "success" && !successFiredRef.current) {
      successFiredRef.current = true;
      window.dispatchEvent(new Event(SPARK_USAGE_UPDATED_EVENT));
      router.refresh();
    }
  }, [terminal, phase, router]);

  // A transitional notice yields to the authoritative snapshot once one
  // arrives (derived during render — no effect needed).
  let message: string | null = status.purchase ? null : notice;
  if (!message && step === "tracking") {
    if (status.error === "network") {
      message = "We couldn't confirm the payment status right now. Please try again.";
    } else if (status.error === "unauthorized") {
      message = "Please sign in again to check your payment status.";
    } else if (status.error === "not_found") {
      message = "We couldn't find that purchase.";
    } else if (current) {
      message = describePurchaseStatus(current);
    } else if (status.stillProcessing) {
      message = "Payment is still being processed. You can check your Spark balance later.";
    } else {
      message =
        "Complete your payment in the payment window if it's open. We'll confirm the status here automatically.";
    }
  }

  return {
    phase,
    purchase: purchase ?? status.purchase,
    message,
    busy: step === "creating" || step === "initializing" || step === "tracking",
    retryable,
    start,
    retry,
    checkStatus,
    dismiss,
  };
}

/**
 * Per-plan-card purchase affordance. FREE and the user's current plan get a
 * plain "Current plan" line; an active subscription blocks other paid plans
 * with a server-derived note; everything else gets the Choose action.
 */
export function SparkPlanPurchaseAction({
  plan,
  planLabel,
  currentPlan,
  subscriptionStatus,
  flow,
}: {
  plan: SubscriptionPlan;
  planLabel: string;
  /** Server-reported effective plan, or null while usage is unavailable. */
  currentPlan: SubscriptionPlan | null;
  /** Server-reported subscription status, or null when none is active. */
  subscriptionStatus: SubscriptionStatus | null;
  flow: SparkPlanPurchaseFlowState;
}) {
  const isCurrent = currentPlan !== null && plan === currentPlan;
  if (isCurrent) {
    return (
      <p className="text-sm font-medium text-muted-foreground">Current plan</p>
    );
  }
  if (plan === "FREE") {
    // FREE can never be purchased; nothing to offer on this card.
    return null;
  }
  const subscriptionActive =
    subscriptionStatus === "ACTIVE" && currentPlan !== null && currentPlan !== "FREE";
  if (subscriptionActive) {
    return (
      <p className="text-sm text-muted-foreground">
        Unavailable while your current plan is active
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={() => flow.start(plan)}
      disabled={flow.busy}
      aria-label={`Choose ${planLabel}`}
      className="min-h-[44px] w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {flow.busy ? "Please wait…" : "Choose plan"}
    </button>
  );
}

const priceFormatter = new Intl.NumberFormat("en-US");

/**
 * Flow status panel: which plan, what price the SERVER reports, and the
 * current stage of payment preparation / confirmation.
 */
export function SparkPlanPurchaseStatusPanel({
  flow,
  planLabels,
}: {
  flow: SparkPlanPurchaseFlowState;
  planLabels: Record<SubscriptionPlan, string>;
}) {
  if (flow.phase === "idle") return null;

  const planLabel = flow.purchase
    ? planLabels[flow.purchase.requestedPlan]
    : null;
  // Price authority: rendered verbatim from the server purchase record.
  const price = flow.purchase
    ? `${priceFormatter.format(flow.purchase.amountMmk)} ${flow.purchase.currency}`
    : null;
  const headline =
    flow.phase === "creating_purchase"
      ? "Preparing your purchase…"
      : flow.phase === "initializing_payment"
        ? "Preparing your payment…"
        : planLabel ?? "Your purchase";

  return (
    <section
      className="mt-4 rounded-xl border border-border bg-muted/30 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{headline}</h4>
        {price ? (
          <p className="text-sm font-medium text-foreground">{price}</p>
        ) : null}
      </div>

      {flow.message ? (
        <p
          className="mt-2 text-sm text-muted-foreground"
          role={flow.phase === "failed" ? "alert" : undefined}
        >
          {flow.message}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {flow.retryable ? (
          <button
            type="button"
            onClick={flow.retry}
            className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
        ) : null}
        {flow.phase === "waiting_for_payment" || flow.phase === "still_processing" ? (
          <button
            type="button"
            onClick={flow.checkStatus}
            className="min-h-[44px] rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Check status
          </button>
        ) : null}
        {flow.phase !== "creating_purchase" && flow.phase !== "initializing_payment" ? (
          <button
            type="button"
            onClick={flow.dismiss}
            className="min-h-[44px] rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Close
          </button>
        ) : null}
      </div>
    </section>
  );
}
