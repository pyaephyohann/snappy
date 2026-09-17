import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveUserFromSession } from '@/lib/session-user';

const REACTION_TYPES = ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY'] as const;
type ReactionType = (typeof REACTION_TYPES)[number];

/** Lightweight reaction/comment summary for Snap cards. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ snapId: string }> }
) {
  try {
    const session = await getSession();

    if (!session || !session.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { snapId } = await params;

    const snap = await prisma.snap.findUnique({
      where: { id: snapId },
      select: { id: true },
    });

    if (!snap) {
      return NextResponse.json({ error: 'Snap not found' }, { status: 404 });
    }

    const user = await resolveUserFromSession(session);

    const [reactions, commentCount, myReaction] = await Promise.all([
      prisma.reaction.groupBy({
        by: ['type'],
        where: { snapId },
        _count: { _all: true },
      }),
      prisma.comment.count({ where: { snapId } }),
      user
        ? prisma.reaction.findUnique({
            where: { userId_snapId: { userId: user.id, snapId } },
            select: { type: true },
          })
        : Promise.resolve(null),
    ]);

    const counts: Record<ReactionType, number> = {
      LIKE: 0,
      LOVE: 0,
      HAHA: 0,
      WOW: 0,
      SAD: 0,
      ANGRY: 0,
    };
    let total = 0;
    for (const row of reactions) {
      if ((REACTION_TYPES as readonly string[]).includes(row.type)) {
        counts[row.type as ReactionType] = row._count._all;
        total += row._count._all;
      }
    }

    return NextResponse.json({
      counts,
      total,
      commentCount,
      myReaction: myReaction?.type ?? null,
    });
  } catch (error) {
    console.error('Snap social summary error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
