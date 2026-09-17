import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { createSnapForUser } from '@/lib/snap-create-service';
import { broadcastNewSnap } from '@/lib/notifications/notification-service';

const createSnapSchema = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required'),
  imageUrl: z.string().url('Invalid image URL'),
  publicId: z.string().min(1, 'Public ID is required'),
  caption: z.string().max(500, 'Caption must be less than 500 characters').optional(),
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

    const { targetUserId, imageUrl, publicId, caption } = validationResult.data;

    const result = await createSnapForUser({
      targetUserId,
      uploadedById: session.userId,
      imageUrl,
      publicId,
      caption,
    });

    if (!result.ok) {
      if (result.error === 'target_not_found') {
        return NextResponse.json(
          { error: 'Target user not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

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
        }
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Snap creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
