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
  const [selectedSnap, setSelectedSnap] = useState<Snap | null>(null);

  const handleSnapClick = (snap: Snap) => {
    setSelectedSnap(snap);
  };

  const handleCloseViewer = () => {
    setSelectedSnap(null);
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {snaps.map((snap) => (
          <SnapCard
            key={snap.id}
            imageUrl={snap.imageUrl}
            caption={snap.caption}
            createdAt={snap.createdAt}
            interactive
            onClick={() => handleSnapClick(snap)}
          />
        ))}
      </div>

      {selectedSnap && (
        <SnapViewer
          isOpen={!!selectedSnap}
          onClose={handleCloseViewer}
          imageUrl={selectedSnap.imageUrl}
          caption={selectedSnap.caption}
          friendName={friendName}
        />
      )}
    </>
  );
}
