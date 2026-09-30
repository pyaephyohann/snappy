"use client";

/**
 * Checkout return surface (S7-B.4) — where the provider redirects the
 * browser after its payment screen (`frontendReturnUrl`).
 *
 * CRITICAL SAFETY PROPERTY: this page reads NO URL query parameter. A
 * provider return may append arbitrary result parameters (`success`,
 * `status`, transaction handles, …) — none of them are ever consulted,
 * parsed, or trusted. The browser return is navigation context only.
 *
 * The ONLY way this page learns which purchase to show is the
 * session-scoped id marker the purchase flow wrote before opening the
 * provider URL — and even that id is used solely as a LOOKUP KEY. The
 * purchase state displayed here always comes from the server via the
 * owner-scoped `GET /api/subscription/purchases/[id]` endpoint; only the
 * server can say a payment SUCCEEDED.
 *
 * When no purchase id is available (e.g. the payment opened in a separate
 * browser without the session marker), the page shows a neutral message —
 * it never guesses an outcome.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SPARK_USAGE_UPDATED_EVENT } from "@/hooks/useSparkUsage";
import { usePurchaseStatus } from "@/hooks/usePurchaseStatus";
import {
  clearActivePurchaseId,
  describePurchaseStatus,
  readActivePurchaseId,
} from "@/lib/purchase-status-client";

export default function CheckoutReturnPage() {
  const router = useRouter();
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const successFiredRef = useRef(false);

  // Read the session marker after mount (client-only storage; never a URL
  // parameter) so there is no server/client render mismatch. The read is
  // deferred one microtask (never a synchronous cascading render);
  // unmounting before it runs is a no-op.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPurchaseId(readActivePurchaseId());
      setResolved(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const status = usePurchaseStatus(resolved ? purchaseId : null);
  const current = status.purchase?.status;

  // Server SUCCEEDED only: refresh the authoritative Spark/profile data.
  useEffect(() => {
    if (current !== "SUCCEEDED" || successFiredRef.current) return;
    successFiredRef.current = true;
    clearActivePurchaseId();
    window.dispatchEvent(new Event(SPARK_USAGE_UPDATED_EVENT));
    router.refresh();
  }, [current, router]);

  let headline = "Checking your payment status…";
  let message: string | null = null;
  if (resolved && !purchaseId) {
    headline = "Payment status";
    message =
      "We're confirming your payment. You can check your Spark balance on your profile.";
  } else if (status.error === "unauthorized") {
    headline = "Payment status";
    message = "Please sign in again to check your payment status.";
  } else if (status.error === "not_found") {
    headline = "Payment status";
    message = "We couldn't find that purchase.";
  } else if (status.error === "network") {
    headline = "Payment status";
    message = "We couldn't confirm the payment status right now. Please try again.";
  } else if (status.stillProcessing) {
    headline = "Payment status";
    message = "Payment is still being processed. You can check your Spark balance later.";
  } else if (current) {
    headline = "Payment status";
    message = describePurchaseStatus(current);
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h1 className="text-lg font-semibold text-foreground">{headline}</h1>
        {message ? (
          <p
            className="mt-3 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            Fetching the latest status from Snappy…
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/profile"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to my profile
          </Link>
          {purchaseId && !current ? (
            <button
              type="button"
              onClick={status.checkNow}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Check status
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
