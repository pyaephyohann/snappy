'use client';

import { useMemo, useState } from 'react';
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
  /**
   * Show caption editing inside the viewer. Only enable where every snap is
   * owned by the viewer (e.g. the profile "My Snaps" section) — the server
   * still enforces uploader ownership on every request.
   */
  canEditCaptions?: boolean;
  /** Called after a caption is saved so the parent can persist/refresh. */
  onCaptionUpdated?: (snapId: string, caption: string | null) => void;
}

function resolveFriendName(snap: GallerySnap, defaultFriendName?: string): string {
  return snap.friendName ?? defaultFriendName ?? '';
}

export default function SnapGallery({
  snaps,
  friendName,
  canEditCaptions = false,
  onCaptionUpdated,
}: SnapGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  /** Locally saved captions so cards/viewer update without a full reload. */
  const [captionOverrides, setCaptionOverrides] = useState<
    Record<string, string | null>
  >({});

  const displaySnaps = useMemo<GallerySnap[]>(() => {
    return snaps.map((snap) =>
      snap.id in captionOverrides
        ? { ...snap, caption: captionOverrides[snap.id] }
        : snap,
    );
  }, [snaps, captionOverrides]);

  const handleCaptionSaved = (snapId: string, caption: string | null) => {
    setCaptionOverrides((current) => ({ ...current, [snapId]: caption }));
    onCaptionUpdated?.(snapId, caption);
  };

  const handleCloseViewer = () => {
    setViewerIndex(null);
  };

  const viewerSnap = viewerIndex !== null ? displaySnaps[viewerIndex] : null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {displaySnaps.map((snap, index) => (
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
          canEditCaption={canEditCaptions}
          onCaptionSaved={(caption) =>
            handleCaptionSaved(viewerSnap.id, caption)
          }
        />
      ) : null}
    </>
  );
}
