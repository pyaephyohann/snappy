'use client';

import { useState } from 'react';
import SnapCard from '@/components/friends/SnapCard';
import SnapViewer from '@/components/snaps/SnapViewer';

interface Snap {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: Date | string;
}

interface SnapGalleryProps {
  snaps: Snap[];
  friendName: string;
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
            imageUrl={snap.imageUrl}
            caption={snap.caption}
            createdAt={snap.createdAt}
            friendName={friendName}
            snapIndex={index}
            interactive
            onClick={() => setViewerIndex(index)}
          />
        ))}
      </div>

      {viewerSnap && viewerIndex !== null && (
        <SnapViewer
          key={viewerSnap.id}
          isOpen
          onClose={handleCloseViewer}
          imageUrl={viewerSnap.imageUrl}
          caption={viewerSnap.caption}
          friendName={friendName}
          snapIndex={viewerIndex}
        />
      )}
    </>
  );
}
