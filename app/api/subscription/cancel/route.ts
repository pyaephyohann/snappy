import { NextResponse } from "next/server";
import { requireAuthenticatedAppUser } from "@/lib/auth";
import {
  cancelSubscription,
  SubscriptionServiceError,
} from "@/lib/subscription-service";

export async function POST() {
  let user;
  try {
    user = await requireAuthenticatedAppUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { subscription } = await cancelSubscription(user.id);
    return NextResponse.json({
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof SubscriptionServiceError) {
      const status =
        error.code === "no_subscription"
          ? 404
          : error.code === "subscription_not_active"
            ? 409
            : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("Subscription cancellation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
