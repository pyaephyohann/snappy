'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import FriendHeader from './FriendHeader';
import SnapGallery from './SnapGallery';
import SnapUploader from '../snaps/SnapUploader';
import { GlowButton } from '@/components/ui/glow-button';
import { uploadSnapForUser } from '@/lib/snap-upload-client';
import FollowButton from '@/components/social/FollowButton';
import type { RelationshipState } from '@/lib/relationships';

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
    uploadedBy?: { name: string } | null;
  }>;
}

interface FriendProfileClientProps {
  friend: FriendWithSnaps;
  relationship?: RelationshipState;
}

export default function FriendProfileClient({
  friend,
  relationship,
}: FriendProfileClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File, caption?: string) => {
    setError(null);
    try {
      await uploadSnapForUser(friend.id, file, caption);
      router.refresh();
    } catch (error) {
      throw error;
    }
  };

  const handleRetry = () => {
    setError(null);
    router.refresh();
  };

  if (error) {
    return (
      <>
        <FriendHeader
          name={friend.name}
          profileImage={friend.profileImage}
          snapCount={friend.snaps.length}
        >
          <div className="flex flex-col items-center gap-3 sm:items-end">
            {relationship ? (
              <FollowButton
                userId={friend.id}
                initialRelationship={relationship}
              />
            ) : null}
            <SnapUploader onUpload={handleUpload} />
          </div>
        </FriendHeader>

        <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
          <p className="text-muted-foreground text-sm sm:text-base mb-4">
            Something went wrong. We couldn&apos;t load the Snaps right now.
          </p>
          <GlowButton
            onClick={handleRetry}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Try Again
          </GlowButton>
        </div>
      </>
    );
  }

  return (
    <>
      <FriendHeader
        name={friend.name}
        profileImage={friend.profileImage}
        snapCount={friend.snaps.length}
      >
        <div className="flex flex-col items-center gap-3 sm:items-end">
          {relationship ? (
            <FollowButton
              userId={friend.id}
              initialRelationship={relationship}
            />
          ) : null}
          <SnapUploader onUpload={handleUpload} />
        </div>
      </FriendHeader>

      {!friend.snaps || friend.snaps.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
          <div className="mb-6">
            <svg
              className="w-16 h-16 mx-auto text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No snaps yet</h3>
          <p className="text-muted-foreground text-sm sm:text-base mb-6">
            Be the first to add a snap to this collection.
          </p>
          <SnapUploader onUpload={handleUpload} />
        </div>
      ) : (
        <SnapGallery
          snaps={friend.snaps.map((snap) => ({
            ...snap,
            uploaderName: snap.uploadedBy?.name ?? null,
          }))}
          friendName={friend.name}
        />
      )}
    </>
  );
}
