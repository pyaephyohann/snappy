import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const REACTION_TYPES = ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY'] as const;

const toggleReactionSchema = z.object({
  type: z.enum(REACTION_TYPES),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { snapId: string } }
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

    const { snapId } = params;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = toggleReactionSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid reaction type' },
        { status: 400 }
      );
    }

    const { type } = validationResult.data;

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

    // Check if user already has a reaction on this snap
    const existingReaction = await prisma.reaction.findUnique({
      where: {
        userId_snapId: {
          userId: user.id,
          snapId: snapId,
        },
      },
    });

    if (existingReaction) {
      // If same reaction, remove it (toggle off)
      if (existingReaction.type === type) {
        await prisma.reaction.delete({
          where: { id: existingReaction.id },
        });
        return NextResponse.json({ reaction: null });
      }

      // If different reaction, update it
      const updatedReaction = await prisma.reaction.update({
        where: { id: existingReaction.id },
        data: { type },
      });
      return NextResponse.json({ 
        reaction: {
          type: updatedReaction.type,
        }
      });
    }

    // Create new reaction
    const reaction = await prisma.reaction.create({
      data: {
        type,
        userId: user.id,
        snapId,
      },
    });

    return NextResponse.json({ 
      reaction: {
        type: reaction.type,
      }
    });

  } catch (error) {
    console.error('Reaction toggle error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
