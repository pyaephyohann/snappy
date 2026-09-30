/**
 * Subscription plan display labels (S7-B.2).
 *
 * The provider payment screen shows one human-readable line per purchase.
 * Labels are SERVER-ONLY product configuration derived from the plan — the
 * payment description is never taken from the client. Kept beside
 * PLAN_CONFIG so a plan rename cannot silently desynchronize the label.
 */
import type { SubscriptionPlan } from "@prisma/client";

export function getPlanLabel(plan: SubscriptionPlan): string {
  switch (plan) {
    case "SPARK_PLUS":
      return "Snappy Spark Plus — 1 month subscription";
    case "SPARK_PRO":
      return "Snappy Spark Pro — 1 month subscription";
    case "SPARK_ULTRA":
      return "Snappy Spark Ultra — 1 month subscription";
    case "FREE":
      // FREE is never purchasable (S7-A enforces paid plans only); this
      // branch exists for exhaustiveness only.
      return "Snappy FREE plan";
    default: {
      const exhaustive: never = plan;
      return `Snappy ${String(exhaustive)} — 1 month subscription`;
    }
  }
}
