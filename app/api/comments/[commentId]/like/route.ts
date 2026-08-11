import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: { commentId: string } }
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

    const { commentId } = params;

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

    // Get username from session
    const username = session.username;
    const user = await prisma.user.findUnique({
      where: { name: username },
    });

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
