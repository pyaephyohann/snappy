import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { broadcastNewSnap } from '@/lib/notifications/notification-service';
import {
  createSnapWithSparkAccounting,
  type SnapUploadError,
} from '@/lib/snap-upload-service';
import {
  validateCloudinarySnapPublicId,
  validateCloudinarySnapUrl,
} from '@/lib/snap-validation';
import { SNAP_MAX_CAPTION_LENGTH } from '@/lib/snap-media';

const createSnapSchema = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required'),
  imageUrl: z.string().url('Invalid image URL'),
  publicId: z.string().min(1, 'Public ID is required'),
  caption: z.string().max(SNAP_MAX_CAPTION_LENGTH, `Caption must be less than ${SNAP_MAX_CAPTION_LENGTH} characters`).optional(),
  /** Client-generated UUID for this logical upload; required for retry safety. */
  idempotencyKey: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    
    if (!session || !session.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validationResult = createSnapSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    const { targetUserId, imageUrl, publicId, caption, idempotencyKey } = validationResult.data;

    // Validate media before any database work (Cloudinary is external,
    // outside any DB transaction — this is correct and intentional).
    if (!validateCloudinarySnapUrl(imageUrl)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }
    if (!validateCloudinarySnapPublicId(publicId)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    // Delegate to the shared upload service (single source of truth for
    // Snap creation + Spark accounting).
    const result = await createSnapWithSparkAccounting({
      targetUserId,
      uploadedById: session.userId,
      imageUrl,
      publicId,
      caption,
      idempotencyKey,
    });

    after(async () => {
      try {
        await broadcastNewSnap({
          snapId: result.snap.id,
          profileOwnerName: result.ownerName,
          uploaderName: result.uploaderName,
        });
      } catch (notifyError) {
        console.error('Snap notification error:', notifyError);
      }
    });

    return NextResponse.json(
      { 
        snap: {
          id: result.snap.id,
          imageUrl: result.snap.imageUrl,
          publicId: result.snap.publicId,
          caption: result.snap.caption,
          userId: result.snap.userId,
          createdAt: result.snap.createdAt,
          updatedAt: result.snap.updatedAt,
        },
        spark: {
          isFreeUpload: result.isFreeUpload,
          sparkRewardCredited: result.sparkRewardCredited,
        },
        idempotent: result.idempotent,
      },
      { status: 201 }
    );

  } catch (error) {
    // Handle known upload service errors.
    if (error && typeof error === 'object' && 'code' in error) {
      const uploadError = error as { code: SnapUploadError; message: string };
      if (uploadError.code === 'insufficient_sparks') {
        return NextResponse.json(
          { error: 'Daily free upload limit reached. Not enough Sparks for an extra upload.' },
          { status: 403 },
        );
      }
      if (uploadError.code === 'target_not_found') {
        return NextResponse.json(
          { error: 'Target user not found' },
          { status: 404 },
        );
      }
    }

    console.error('Snap creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
