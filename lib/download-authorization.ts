/**
 * Shared contract for the server-authoritative Snap download accounting API
 * (D3 — Download Snap Limit with Sparks).
 *
 * This module is dependency-free (no Prisma, no server code) so the same
 * types can be imported by the server route/service and by the client
 * download flow without pulling server modules into the browser bundle.
 *
 * The client NEVER decides whether a download is free — it only renders the
 * server's decision.
 */

/** Server-authoritative free-download usage for the current Asia/Yangon day. */
export interface DownloadUsageSnapshot {
  /** Free downloads consumed today. */
  freeDownloadsUsed: number;
  /** Free downloads still available today. */
  freeDownloadsRemaining: number;
  /** Max free downloads per Asia/Yangon day (3). */
  freeDailyDownloads: number;
  /** True once the free allowance for today is exhausted. */
  isFreeExhausted: boolean;
}

/**
 * Outcome of one "authorize and account for a Snap download" request.
 *
 * - `authorized: true, mode: "FREE"`  — a free allowance slot was consumed.
 * - `authorized: true, mode: "SPARK"` — exactly 1 Spark was debited through
 *   the existing Spark ledger (idempotently for this logical request).
 * - `SPARK_REQUIRED` — free allowance exhausted; the client must show the
 *   Spark confirmation before re-requesting with `confirmed: true`.
 * - `INSUFFICIENT_SPARKS` — confirmed but balance < sparkCost; nothing was
 *   charged and the Snap must NOT be downloaded.
 */
export type DownloadAuthorizationDecision =
  | ({ authorized: true; mode: "FREE" } & DownloadUsageSnapshot)
  | ({
      authorized: true;
      mode: "SPARK";
      sparkCost: number;
      /** Sparks actually debited for this logical download. */
      sparkSpent: number;
      /** True when this request replayed an already-charged reference. */
      idempotent: boolean;
    } & DownloadUsageSnapshot)
  | ({
      authorized: false;
      reason: "SPARK_REQUIRED";
      sparkCost: number;
    } & DownloadUsageSnapshot)
  | { authorized: false; reason: "INSUFFICIENT_SPARKS"; sparkCost: number };

/** Decision plus transport-level failures of the authorize request itself. */
export type DownloadAuthorizationResult =
  | DownloadAuthorizationDecision
  | { authorized: false; reason: "ERROR"; error: string };

export const DOWNLOAD_AUTHORIZE_ENDPOINT = "/api/downloads/authorize";
export const DOWNLOAD_USAGE_ENDPOINT = "/api/downloads/usage";

/** Client-side message for a confirmed download without enough Sparks. */
export const OUT_OF_SPARKS_MESSAGE = "You're out of Sparks ✨";

/**
 * Stable idempotency key for ONE logical download attempt (mirrors the
 * caption-edit key pattern in SnapViewer). The key becomes the Spark
 * transaction `referenceId`, so retries can never charge twice.
 */
export function generateDownloadIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Ask the server to authorize and account for one Snap download.
 *
 * Never throws — transport failures resolve to `{ reason: "ERROR" }` so the
 * caller can surface its existing failure message.
 */
export async function requestDownloadAuthorization(input: {
  idempotencyKey: string;
  confirmed?: boolean;
}): Promise<DownloadAuthorizationResult> {
  try {
    const response = await fetch(DOWNLOAD_AUTHORIZE_ENDPOINT, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: input.idempotencyKey,
        confirmed: input.confirmed === true,
      }),
    });

    const body = (await response.json().catch(() => null)) as {
      authorized?: boolean;
      sparkCost?: number;
      error?: string;
      code?: string;
    } | null;

    if (
      response.ok &&
      body &&
      typeof body === "object" &&
      typeof body.authorized === "boolean"
    ) {
      return body as DownloadAuthorizationResult;
    }

    // Mirrors the existing insufficient-Sparks convention (403 + code).
    if (response.status === 403 && body?.code === "insufficient_sparks") {
      return {
        authorized: false,
        reason: "INSUFFICIENT_SPARKS",
        sparkCost:
          typeof body.sparkCost === "number" ? body.sparkCost : 1,
      };
    }

    return {
      authorized: false,
      reason: "ERROR",
      error: body?.error ?? "Download failed. Please try again.",
    };
  } catch {
    return {
      authorized: false,
      reason: "ERROR",
      error: "Download failed. Please try again.",
    };
  }
}
