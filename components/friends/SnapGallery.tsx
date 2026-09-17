'use client';

import { useState } from 'react';
import SnapCard from '@/components/friends/SnapCard';
import SnapViewer from '@/components/snaps/SnapViewer';

export type GallerySnap = {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: Date | string;
  /** Profile owner name when snaps come from multiple users (e.g. /snaps). */
  friendName?: string;
  /** Uploader username for attribution (null on legacy snaps). */
  uploaderName?: string | null;
};

interface SnapGalleryProps {
  snaps: GallerySnap[];
  /** Default profile name when each snap omits `friendName` (friend profile page). */
  friendName?: string;
}

function resolveFriendName(snap: GallerySnap, defaultFriendName?: string): string {
  return snap.friendName ?? defaultFriendName ?? '';
}

export default function SnapGallery({ snaps, friendName }: SnapGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const handleCloseViewer = () => {
    setViewerIndex(null);
  };

  const viewerSnap = viewerIndex !== null ? snaps[viewerIndex] : null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {snaps.map((snap, index) => (
          <SnapCard
            key={snap.id}
            id={snap.id}
            imageUrl={snap.imageUrl}
            caption={snap.caption}
            createdAt={snap.createdAt}
            friendName={resolveFriendName(snap, friendName)}
            snapIndex={index}
            uploaderName={snap.uploaderName}
            interactive
            onClick={() => setViewerIndex(index)}
          />
        ))}
      </div>

      {viewerSnap && viewerIndex !== null ? (
        <SnapViewer
          key={viewerSnap.id}
          isOpen
          onClose={handleCloseViewer}
          imageUrl={viewerSnap.imageUrl}
          caption={viewerSnap.caption}
          friendName={resolveFriendName(viewerSnap, friendName)}
          snapIndex={viewerIndex}
          snapId={viewerSnap.id}
        />
      ) : null}
    </>
  );
}
