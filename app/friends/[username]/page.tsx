import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import FriendHeader from '@/components/friends/FriendHeader';
import SnapGallery from '@/components/friends/SnapGallery';
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
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary">Snappy</h1>
              <p className="text-muted-foreground text-sm sm:text-base mt-1">
                Hey, {session.username} 👋
              </p>
            </div>
            <Link
              href="/home"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded px-2 py-1"
            >
              ← Back to Friends
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Friend Header */}
        <FriendHeader
          name={friend.name}
          profileImage={friend.profileImage}
          snapCount={friend.snaps?.length || 0}
        />

        {/* Snaps Grid */}
        {!friend.snaps || friend.snaps.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
            <p className="text-muted-foreground text-sm sm:text-base">
              {friend.name} hasn&apos;t shared any snaps yet.
            </p>
            <Link
              href="/home"
              className="inline-block mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Back to Friends
            </Link>
          </div>
        ) : (
          <SnapGallery snaps={friend.snaps} friendName={friend.name} />
        )}
      </main>
    </div>
  );
}
