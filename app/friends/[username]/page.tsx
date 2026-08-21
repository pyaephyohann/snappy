import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import FriendProfileClient from '@/components/friends/FriendProfileClient';
import Navbar from '@/components/layout/Navbar';
import { Metadata } from 'next';

interface FriendWithSnaps {
  id: string;
  name: string;
  profileImage: string;
  createdAt: Date;
  snaps: Array<{
    id: string;
    imageUrl: string;
    caption: string | null;
    createdAt: Date | string;
  }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);

  return {
    title: `${decodedUsername}'s Snaps | Snappy`,
    description: `View ${decodedUsername}'s snaps on Snappy`,
  };
}

export default async function FriendProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);

  // Fetch friend data with their snaps in a single query
  const friend = await prisma.user.findFirst({
    where: {
      name: decodedUsername,
    },
    include: {
      snaps: {
        select: {
          id: true,
          imageUrl: true,
          caption: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  }) as FriendWithSnaps | null;

  // If friend doesn't exist, show not-found page
  if (!friend) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <Navbar username={session.username} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Back Navigation */}
        <div className="mb-4 sm:mb-6">
          <Link
            href="/home"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded px-2 py-1 inline-flex items-center gap-1"
          >
            ← Back to Friends
          </Link>
        </div>

        {/* Friend Profile Content */}
        <FriendProfileClient friend={friend} />
      </main>
    </div>
  );
}
