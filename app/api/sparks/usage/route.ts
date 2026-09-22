import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getSparkUsageSummary } from "@/lib/spark-service";

/**
 * GET /api/sparks/usage (S2 — Snap Integration)
 *
 * Returns the authenticated user's server-authoritative Spark usage summary:
 * balance, free uploads used/remaining today, daily earning used/remaining,
 * and the cost of an upload once the free allowance is exhausted.
 *
 * Read-only presentation data. All values are derived from the Spark ledger
 * and daily counters — the client never computes or decides Spark state.
 */
export async function GET() {
  try {
    const session = await requireSession();

    if (!session.authenticated || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const usage = await getSparkUsageSummary(session.userId);
    return NextResponse.json({ usage });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Spark usage error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
