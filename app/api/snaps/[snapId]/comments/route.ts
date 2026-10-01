import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveUserFromSession } from '@/lib/session-user';
import { notifySnapInteraction } from '@/lib/notifications/notification-service';
import { MAX_COMMENT_LENGTH } from '@/lib/snap-reactions';

// Same page size convention as /api/notifications and the Snap reactors list.
const COMMENTS_PAGE_SIZE = 30;

// Trim first, then validate: `min(1)` must run against the trimmed value so a
// whitespace-only body is rejected instead of silently stored as "".
const createCommentSchema = z.object({
  content: z.string()
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(MAX_COMMENT_LENGTH, `Comment must be less than ${MAX_COMMENT_LENGTH} characters`),
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

    // Notify the Snap owner (no-op for self-comments). Fire-and-forget so a
    // notification failure never breaks the comment response.
    void notifySnapInteraction({
      snapId,
      actorId: user.id,
      type: 'COMMENT',
      body: comment.content,
    }).catch((notifyError) => {
      console.error('[Notification] Comment notify error:', notifyError);
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

    const cursor = request.nextUrl.searchParams.get('cursor');

    // One keyset page of comments, newest first — the same cursor convention
    // as /api/notifications and /api/snaps/[snapId]/reactions (take SIZE+1,
    // cursor by id, nextCursor = last returned id). Never unbounded.
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
      take: COMMENTS_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = comments.length > COMMENTS_PAGE_SIZE;
    const page = hasMore ? comments.slice(0, COMMENTS_PAGE_SIZE) : comments;

    // Get all comment IDs liked by current user
    const likedCommentIds = await prisma.commentLike.findMany({
      where: {
        userId: user.id,
        commentId: {
          in: page.map(c => c.id),
        },
      },
      select: {
        commentId: true,
      },
    });

    const likedCommentIdSet = new Set(likedCommentIds.map(l => l.commentId));

    const commentsWithLikeInfo = page.map(comment => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      user: comment.user,
      likeCount: comment._count.commentLikes,
      liked: likedCommentIdSet.has(comment.id),
    }));

    return NextResponse.json({
      comments: commentsWithLikeInfo,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });

  } catch (error) {
    console.error('Comment list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
