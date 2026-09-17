import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { broadcastNewSnap } from '@/lib/notifications/notification-service';

const createSnapSchema = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required'),
  imageUrl: z.string().url('Invalid image URL'),
  publicId: z.string().min(1, 'Public ID is required'),
  caption: z.string().max(500, 'Caption must be less than 500 characters').optional(),
});

const CLOUDINARY_DOMAIN = 'res.cloudinary.com';
const CLOUDINARY_FOLDER = 'snappy/snaps/';

function validateCloudinaryUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    
    // Must be HTTPS
    if (urlObj.protocol !== 'https:') {
      return false;
    }
    
    // Must belong to Cloudinary domain
    if (urlObj.hostname !== CLOUDINARY_DOMAIN) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

function validateCloudinaryPublicId(publicId: string): boolean {
  // Must be non-empty
  if (!publicId || publicId.trim().length === 0) {
    return false;
  }
  
  // Must belong to expected folder
  if (!publicId.startsWith(CLOUDINARY_FOLDER)) {
    return false;
  }
  
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate the request
    const session = await requireSession();
    
    if (!session || !session.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = createSnapSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    const { targetUserId, imageUrl, publicId, caption } = validationResult.data;

    // Normalize empty caption to null
    const normalizedCaption = caption && caption.trim().length > 0 ? caption.trim() : null;

    // Validate Cloudinary URL
    if (!validateCloudinaryUrl(imageUrl)) {
      return NextResponse.json(
        { error: 'Invalid image URL' },
        { status: 400 }
      );
    }

    // Validate Cloudinary public ID
    if (!validateCloudinaryPublicId(publicId)) {
      return NextResponse.json(
        { error: 'Invalid public ID' },
        { status: 400 }
      );
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      );
    }

    // Create Snap - belongs to target user, not logged-in user
    const snap = await prisma.snap.create({
      data: {
        userId: targetUserId, // Snap belongs to target user
        imageUrl,
        publicId,
        caption: normalizedCaption,
      },
    });

    void (async () => {
      try {
        await broadcastNewSnap({
          snapId: snap.id,
          profileOwnerName: targetUser.name,
        });
      } catch (notifyError) {
        console.error('Snap notification error:', notifyError);
      }
    })();

    // Return safe response
    return NextResponse.json(
      { 
        snap: {
          id: snap.id,
          imageUrl: snap.imageUrl,
          publicId: snap.publicId,
          caption: snap.caption,
          userId: snap.userId,
          createdAt: snap.createdAt,
          updatedAt: snap.updatedAt,
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
