import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { authorizeDownload } from "@/lib/download-service";

/**
 * POST /api/downloads/authorize (D3 — Download Snap Limit with Sparks)
 *
 * Server-authoritative accounting for ONE Snap download:
 * - consumes a free allowance slot when one remains today (Asia/Yangon),
 * - otherwise, ONLY after the client passed `confirmed: true`, debits
 *   exactly 1 Spark through the existing Spark ledger (idempotent on the
 *   client-supplied idempotency key),
 * - never trusts a client-provided user id or count: identity comes from
 *   the session and all accounting runs in one server transaction.
 *
 * The image bytes themselves are still fetched through the unchanged
 * `lib/download-image.ts` + `/api/download-image` proxy AFTER this
 * authorization succeeds.
 */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

const NO_STORE = { "Cache-Control": "private, no-cache, no-store" };

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { idempotencyKey?: unknown; confirmed?: unknown } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const idempotencyKey =
    typeof body?.idempotencyKey === "string" ? body.idempotencyKey : "";
  const confirmed = body?.confirmed === true;

  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return NextResponse.json({ error: "Invalid idempotency key" }, { status: 400 });
  }

  try {
    const decision = await authorizeDownload(user.id, {
      idempotencyKey,
      confirmed,
    });

    if (decision.authorized) {
      return NextResponse.json(decision, { headers: NO_STORE });
    }

    if (decision.reason === "SPARK_REQUIRED") {
      // A normal server decision (not an error): the client must show the
      // Spark confirmation before re-requesting with `confirmed: true`.
      return NextResponse.json(decision, { headers: NO_STORE });
    }

    // INSUFFICIENT_SPARKS — mirrors the existing 403 + code convention
    // used by the caption-edit Spark endpoint. Nothing was charged.
    return NextResponse.json(
      { ...decision, error: "Insufficient Sparks", code: "insufficient_sparks" },
      { status: 403, headers: NO_STORE },
    );
  } catch {
    // Never expose internal/database errors to the client.
    return NextResponse.json(
      { error: "Failed to authorize download" },
      { status: 500, headers: NO_STORE },
    );
  }
}
