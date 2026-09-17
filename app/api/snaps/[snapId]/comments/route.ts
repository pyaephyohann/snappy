import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveUserFromSession } from '@/lib/session-user';

const MAX_COMMENT_LENGTH = 500;

const createCommentSchema = z.object({
  content: z.string()
    .min(1, 'Comment cannot be empty')
    .max(MAX_COMMENT_LENGTH, `Comment must be less than ${MAX_COMMENT_LENGTH} characters`)
    .trim(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ snapId: string }> }
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

    const { snapId } = await params;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = createCommentSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { content } = validationResult.data;

    // Verify snap exists
    const snap = await prisma.snap.findUnique({
      where: { id: snapId },
    });

    if (!snap) {
      return NextResponse.json(
        { error: 'Snap not found' },
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

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        content,
        userId: user.id,
        snapId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profileImage: true,
          },
        },
      },
    });

    // Get like count
    const likeCount = await prisma.commentLike.count({
      where: { commentId: comment.id },
    });

    return NextResponse.json({
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        user: comment.user,
        likeCount,
        liked: false,
      },
    }, { status: 201 });

  } catch (error) {
    console.error('Comment creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ snapId: string }> }
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

    const { snapId } = await params;

    // Verify snap exists
    const snap = await prisma.snap.findUnique({
      where: { id: snapId },
    });

    if (!snap) {
      return NextResponse.json(
        { error: 'Snap not found' },
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

    // Get comments with like counts and whether current user liked each
    const comments = await prisma.comment.findMany({
      where: { snapId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profileImage: true,
          },
        },
        _count: {
          select: {
            commentLikes: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get all comment IDs liked by current user
    const likedCommentIds = await prisma.commentLike.findMany({
      where: {
        userId: user.id,
        commentId: {
          in: comments.map(c => c.id),
        },
      },
      select: {
        commentId: true,
      },
    });

    const likedCommentIdSet = new Set(likedCommentIds.map(l => l.commentId));

    const commentsWithLikeInfo = comments.map(comment => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      user: comment.user,
      likeCount: comment._count.commentLikes,
      liked: likedCommentIdSet.has(comment.id),
    }));

    return NextResponse.json({ comments: commentsWithLikeInfo });

  } catch (error) {
    console.error('Comment list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
