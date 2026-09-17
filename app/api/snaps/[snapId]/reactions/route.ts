import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  REACTION_TYPES,
  type SnapReactionType,
} from '@/lib/snap-reactions';

const REACTORS_PAGE_SIZE = 30;

function isReactionType(value: string): value is SnapReactionType {
  return (REACTION_TYPES as readonly string[]).includes(value);
}

/** Detailed reactor list for the "Who Reacted" sheet. Fetched on demand. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ snapId: string }> }
) {
  try {
    const session = await getSession();

    if (!session || !session.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { snapId } = await params;
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type')?.trim().toUpperCase() ?? '';
    const cursor = searchParams.get('cursor')?.trim() || undefined;
    const typeFilter =
      typeParam && isReactionType(typeParam) ? typeParam : undefined;

    const snap = await prisma.snap.findUnique({
      where: { id: snapId },
      select: { id: true },
    });

    if (!snap) {
      return NextResponse.json({ error: 'Snap not found' }, { status: 404 });
    }

    const [grouped, reactions] = await Promise.all([
      prisma.reaction.groupBy({
        by: ['type'],
        where: { snapId },
        _count: { _all: true },
      }),
      prisma.reaction.findMany({
        where: { snapId, ...(typeFilter ? { type: typeFilter } : {}) },
        orderBy: { createdAt: 'desc' },
        take: REACTORS_PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          type: true,
          user: {
            select: {
              id: true,
              name: true,
              profileImage: true,
            },
          },
        },
      }),
    ]);

    const counts: Record<string, number> = { all: 0 };
    for (const row of grouped) {
      if (isReactionType(row.type)) {
        counts[row.type] = row._count._all;
        counts.all += row._count._all;
      }
    }

    const hasMore = reactions.length > REACTORS_PAGE_SIZE;
    const page = hasMore ? reactions.slice(0, REACTORS_PAGE_SIZE) : reactions;

    return NextResponse.json({
      counts,
      reactions: page.map((reaction) => ({
        id: reaction.id,
        type: reaction.type,
        user: reaction.user,
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  } catch (error) {
    console.error('Snap reactors list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
