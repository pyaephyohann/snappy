import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getAuthenticatedAppUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import FriendProfileClient from '@/components/friends/FriendProfileClient';
import Navbar from '@/components/layout/Navbar';
import { Metadata } from 'next';
import { getCurrentUserProfileImage } from '@/lib/user-profile';
import { getRelationshipState } from '@/lib/relationships';

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
    uploadedBy: { name: string } | null;
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
  const user = await getAuthenticatedAppUser();

  if (!user) {
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
          uploadedBy: {
            select: {
              name: true,
            },
          },
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

  const [profileImage, relationship] = await Promise.all([
    getCurrentUserProfileImage(user.id),
    friend.id === user.id
      ? Promise.resolve(null)
      : getRelationshipState(user.id, friend.id),
  ]);

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <Navbar username={user.name} profileImage={profileImage} />

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
        <FriendProfileClient friend={friend} relationship={relationship ?? undefined} />
      </main>
    </div>
  );
}
