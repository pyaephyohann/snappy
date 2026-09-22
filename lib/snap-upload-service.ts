/**
 * Shared Snap Upload Service (S1 — Foundation)
 *
 * The single authoritative operation for creating Snaps with Spark accounting.
 * Web/PWA, Telegram Mini App, and Telegram Bot all call this service.
 * Cloudinary remains outside the database transaction.
 */

import { prisma } from "@/lib/prisma";
import {
  atomicSpendSparks,
  incrementDailySparkEarnCounter,
  incrementDailyUploadCounter,
  recordUploadUsage,
  SparkServiceError,
  FREE_DAILY_UPLOADS,
} from "@/lib/spark-service";
import { Prisma } from "@prisma/client";

export interface SnapUploadInput {
  targetUserId: string;
  uploadedById: string;
  imageUrl: string;
  publicId: string;
  caption?: string | null;
  /** Stable key for one logical upload. Required for retry-safe semantics. */
  idempotencyKey: string;
}

export interface SnapUploadResult {
  ok: true;
  idempotent: boolean;
  snap: {
    id: string;
    imageUrl: string;
    publicId: string;
    caption: string | null;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  };
  ownerName: string;
  uploaderName: string;
  isFreeUpload: boolean;
  sparkRewardCredited: boolean;
  /** Sparks actually debited for this logical upload (0 for free uploads). */
  sparkSpent: number;
}

export type SnapUploadError =
  | "target_not_found"
  | "uploader_not_found"
  | "invalid_media"
  | "invalid_caption"
  | "insufficient_sparks";

const MAX_IDEMPOTENCY_RETRIES = 3;

/**
 * Read the Sparks actually debited for an existing (idempotent) upload.
 *
 * The charge is keyed by (userId, type, referenceId) in the ledger, so a
 * replay reports the real original amount instead of assuming the cost.
 * Must be called inside the same Prisma transaction as the operation read.
 */
async function readRecordedSparkSpend(
  tx: Prisma.TransactionClient,
  input: SnapUploadInput,
): Promise<number> {
  const debit = await tx.sparkTransaction.findUnique({
    where: {
      userId_type_referenceId: {
        userId: input.uploadedById,
        type: "EXTRA_SNAP_UPLOAD",
        referenceId: input.idempotencyKey,
      },
    },
    select: { amount: true },
  });
  return debit ? Math.abs(debit.amount) : 0;
}

/**
 * Create one logical Snap upload atomically.
 *
 * The SnapUploadOperation unique constraint is the authoritative upload-level
 * idempotency boundary. A concurrent unique-conflict retry reads the operation
 * committed by the winner and returns the same Snap/result.
 */
export async function createSnapWithSparkAccounting(
  input: SnapUploadInput,
  now: Date = new Date(),
): Promise<SnapUploadResult> {
  if (!input.idempotencyKey.trim()) {
    throw new SparkServiceError(
      "invalid_operation",
      "idempotency_key_required",
    );
  }

  for (let attempt = 0; attempt < MAX_IDEMPOTENCY_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existingOperation = await tx.snapUploadOperation.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: input.uploadedById,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: {
            snapId: true,
            isFreeUpload: true,
            sparkRewardCredited: true,
          },
        });

        if (existingOperation?.snapId) {
          const existing = await tx.snap.findUnique({
            where: { id: existingOperation.snapId },
            select: {
              id: true,
              imageUrl: true,
              publicId: true,
              caption: true,
              userId: true,
              createdAt: true,
              updatedAt: true,
              user: { select: { name: true } },
              uploadedBy: { select: { name: true } },
            },
          });

          // The operation and Snap are in one transaction, so this indicates
          // corruption/legacy data rather than a normal retry.
          if (!existing) {
            throw new SparkServiceError(
              "invalid_operation",
              "upload_operation_snap_missing",
            );
          }

          return {
            ok: true,
            idempotent: true,
            snap: {
              id: existing.id,
              imageUrl: existing.imageUrl,
              publicId: existing.publicId,
              caption: existing.caption,
              userId: existing.userId,
              createdAt: existing.createdAt,
              updatedAt: existing.updatedAt,
            },
            ownerName: existing.user.name,
            uploaderName: existing.uploadedBy?.name ?? input.uploadedById,
            isFreeUpload: existingOperation.isFreeUpload ?? false,
            sparkRewardCredited: existingOperation.sparkRewardCredited ?? false,
            sparkSpent: await readRecordedSparkSpend(tx, input),
          };
        }

        // Create the operation before any economy mutation. The composite
        // unique constraint serializes concurrent requests with this key.
        // If another transaction wins, this create raises P2002 after waiting;
        // the outer retry then reads the winner's completed operation.
        await tx.snapUploadOperation.create({
          data: {
            userId: input.uploadedById,
            idempotencyKey: input.idempotencyKey,
          },
        });

        const [targetUser, uploader] = await Promise.all([
          tx.user.findUnique({
            where: { id: input.targetUserId },
            select: { id: true, name: true, isActive: true },
          }),
          tx.user.findUnique({
            where: { id: input.uploadedById },
            select: { id: true, name: true, isActive: true },
          }),
        ]);

        if (!targetUser || !targetUser.isActive) {
          throw new SparkServiceError("invalid_operation", "target_not_found");
        }
        if (!uploader || !uploader.isActive) {
          throw new SparkServiceError("invalid_operation", "uploader_not_found");
        }

        const normalizedCaption =
          input.caption && input.caption.trim().length > 0
            ? input.caption.trim()
            : null;
        if (normalizedCaption && normalizedCaption.length > 500) {
          throw new SparkServiceError("invalid_operation", "invalid_caption");
        }

        const counterResult = await incrementDailyUploadCounter(
          tx,
          input.uploadedById,
          now,
          FREE_DAILY_UPLOADS,
        );
        const isFreeUpload = counterResult !== null;

        let sparkSpent = 0;
        if (!isFreeUpload) {
          const spendResult = await atomicSpendSparks(tx, {
            userId: input.uploadedById,
            type: "EXTRA_SNAP_UPLOAD",
            referenceId: input.idempotencyKey,
            reason: "extra_snap_upload",
          });
          sparkSpent = spendResult.amountDeducted;
        }

        const snap = await tx.snap.create({
          data: {
            userId: targetUser.id,
            uploadedById: input.uploadedById,
            imageUrl: input.imageUrl,
            publicId: input.publicId,
            caption: normalizedCaption,
          },
        });

        await recordUploadUsage(
          tx,
          input.uploadedById,
          snap.id,
          isFreeUpload,
        );

        let sparkRewardCredited = false;
        if (isFreeUpload) {
          const rewardSlot = await incrementDailySparkEarnCounter(
            tx,
            input.uploadedById,
            now,
          );
          if (rewardSlot) {
            await tx.sparkTransaction.create({
              data: {
                userId: input.uploadedById,
                amount: 1,
                type: "UPLOAD_REWARD",
                source: "SNAP",
                sparkKind: "EARNED",
                referenceType: "snap",
                referenceId: snap.id,
                metadata: { action: "upload_reward" },
              },
            });
            sparkRewardCredited = true;
          }
        }

        await tx.snapUploadOperation.update({
          where: {
            userId_idempotencyKey: {
              userId: input.uploadedById,
              idempotencyKey: input.idempotencyKey,
            },
          },
          data: {
            snapId: snap.id,
            isFreeUpload,
            sparkRewardCredited,
          },
        });

        return {
          ok: true,
          idempotent: false,
          snap: {
            id: snap.id,
            imageUrl: snap.imageUrl,
            publicId: snap.publicId,
            caption: snap.caption,
            userId: snap.userId,
            createdAt: snap.createdAt,
            updatedAt: snap.updatedAt,
          },
          ownerName: targetUser.name,
          uploaderName: uploader.name,
          isFreeUpload,
          sparkRewardCredited,
          sparkSpent,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        attempt < MAX_IDEMPOTENCY_RETRIES - 1
      ) {
        // A concurrent request won the (userId, idempotencyKey) insert.
        // Retry the transaction so it reads and returns that operation.
        continue;
      }
      throw error;
    }
  }

  throw new SparkServiceError(
    "invalid_operation",
    "upload_idempotency_retry_exhausted",
  );
}
