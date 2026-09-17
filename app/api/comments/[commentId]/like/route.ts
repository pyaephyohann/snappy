import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveUserFromSession } from '@/lib/session-user';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    // Authenticate the request
    const session = await requireSession();
    
    if (!session || !session.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { commentId } = await params;

    // Verify comment exists
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    const user = await resolveUserFromSession(session);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user already liked this comment
    const existingLike = await prisma.commentLike.findUnique({
      where: {
        userId_commentId: {
          userId: user.id,
          commentId: commentId,
        },
      },
    });

    if (existingLike) {
      // Remove like (toggle off)
      await prisma.commentLike.delete({
        where: { id: existingLike.id },
      });

      // Get updated like count
      const likeCount = await prisma.commentLike.count({
        where: { commentId },
      });

      return NextResponse.json({ 
        liked: false,
        likeCount,
      });
    }

    // Create like
    await prisma.commentLike.create({
      data: {
        userId: user.id,
        commentId,
      },
    });

    // Get updated like count
    const likeCount = await prisma.commentLike.count({
      where: { commentId },
    });

    return NextResponse.json({ 
      liked: true,
      likeCount,
    });

  } catch (error) {
    console.error('Comment like toggle error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
