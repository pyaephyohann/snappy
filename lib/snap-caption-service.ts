import { prisma } from "@/lib/prisma";
import {
  atomicSpendSparks,
  SparkServiceError,
} from "@/lib/spark-service";
import { Prisma } from "@prisma/client";

export interface SnapCaptionEditInput {
  userId: string;
  snapId: string;
  caption: string | null;
  /** Stable key for one logical caption edit. */
  idempotencyKey: string;
}

export interface SnapCaptionEditResult {
  snap: {
    id: string;
    caption: string | null;
    updatedAt: Date;
  };
  /** Sparks newly deducted by this request; zero for no-op/replay. */
  sparkSpent: number;
  /** True when an existing charge key was replayed. */
  idempotent: boolean;
  /** True when the submitted caption already matched the stored caption. */
  noOp: boolean;
}

const MAX_IDEMPOTENCY_RETRIES = 3;

/**
 * Atomically authorize, charge, and update one Snap caption.
 *
 * A no-op caption is returned without a charge. For a real edit, the caption
 * update and CAPTION_EDIT ledger debit are committed in one transaction. A
 * stable idempotency key makes request retries safe without weakening the
 * server-side balance check.
 */
export async function updateSnapCaptionWithSparkAccounting(
  input: SnapCaptionEditInput,
): Promise<SnapCaptionEditResult> {
  if (!input.idempotencyKey.trim()) {
    throw new SparkServiceError(
      "invalid_operation",
      "idempotency_key_required",
    );
  }

  for (let attempt = 0; attempt < MAX_IDEMPOTENCY_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const snap = await tx.snap.findUnique({
          where: { id: input.snapId },
          select: { id: true, uploadedById: true, caption: true, updatedAt: true },
        });

        if (!snap) {
          throw new SparkServiceError("invalid_operation", "snap_not_found");
        }
        if (snap.uploadedById !== input.userId) {
          throw new SparkServiceError("unauthorized", "not_upload_owner");
        }

        if (snap.caption === input.caption) {
          return {
            snap: {
              id: snap.id,
              caption: snap.caption,
              updatedAt: snap.updatedAt,
            },
            sparkSpent: 0,
            idempotent: false,
            noOp: true,
          };
        }

        const existingSpend = await tx.sparkTransaction.findFirst({
          where: {
            userId: input.userId,
            type: "CAPTION_EDIT",
            referenceId: input.idempotencyKey,
          },
          select: { id: true },
        });

        // A replay of a completed logical edit returns the current stored
        // result. It must not apply a different caption without a new key or
        // charge, even if a stale client changes the request body.
        if (existingSpend) {
          return {
            snap: {
              id: snap.id,
              caption: snap.caption,
              updatedAt: snap.updatedAt,
            },
            sparkSpent: 0,
            idempotent: true,
            noOp: false,
          };
        }

        const spend = await atomicSpendSparks(tx, {
          userId: input.userId,
          type: "CAPTION_EDIT",
          referenceId: input.idempotencyKey,
          reason: "caption_edit",
        });

        const updated = await tx.snap.update({
          where: { id: snap.id },
          data: { caption: input.caption },
          select: { id: true, caption: true, updatedAt: true },
        });

        return {
          snap: updated,
          sparkSpent: spend.amountDeducted,
          idempotent: false,
          noOp: false,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        attempt < MAX_IDEMPOTENCY_RETRIES - 1
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new SparkServiceError(
    "invalid_operation",
    "caption_edit_idempotency_retry_exhausted",
  );
}
