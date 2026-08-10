import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import FriendHeader from '@/components/friends/FriendHeader';
import SnapCard from '@/components/friends/SnapCard';

interface FriendWithSnaps {
  id: string;
  name: string;
  profileImage: string;
  createdAt: Date;
  snaps: Array<{
    id: string;
    imageUrl: string;
    caption: string | null;
    createdAt: Date;
  }>;
}

export default async function FriendProfilePage({
  params,
}: {
  params: { username: string };
}) {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  const decodedUsername = decodeURIComponent(params.username);

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-primary">Snappy</h1>
              <p className="text-muted-foreground mt-1">
                Hey, {session.username} 👋
              </p>
            </div>
            <Link
              href="/home"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Friend Header */}
        <FriendHeader
          name={friend.name}
          profileImage={friend.profileImage}
          snapCount={friend.snaps?.length || 0}
        />

        {/* Snaps Grid */}
        {!friend.snaps || friend.snaps.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <p className="text-muted-foreground">
              {friend.name} hasn&apos;t shared any snaps yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {friend.snaps.map((snap) => (
              <SnapCard
                key={snap.id}
                imageUrl={snap.imageUrl}
                caption={snap.caption}
                createdAt={snap.createdAt}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
