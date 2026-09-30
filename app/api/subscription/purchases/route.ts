import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedAppUser } from "@/lib/auth";
import { isSocialMutationRateLimited } from "@/lib/social-rate-limit";
import {
  createPurchase,
  SubscriptionPurchaseServiceError,
} from "@/lib/subscription-purchase-service";

const requestSchema = z
  .object({
    plan: z.enum(["SPARK_PLUS", "SPARK_PRO", "SPARK_ULTRA"]),
  })
  .strict();

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuthenticatedAppUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isSocialMutationRateLimited(`subscription-purchase:${user.id}`)) {
    return NextResponse.json(
      { error: "Please wait before trying again" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request must contain only a valid paid plan" },
      { status: 400 },
    );
  }

  try {
    const purchase = await createPurchase(
      user.id,
      parsed.data.plan,
      request.headers.get("idempotency-key") ?? "",
    );
    return NextResponse.json(
      { purchase },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof SubscriptionPurchaseServiceError) {
      const status =
        error.code === "invalid_plan" || error.code === "invalid_idempotency_key"
          ? 400
          : error.code === "subscription_already_active" || error.code === "idempotency_conflict"
            ? 409
            : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    // Never serialize raw database/provider exceptions into application logs.
    console.error("Subscription purchase creation failed (internal error)");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
