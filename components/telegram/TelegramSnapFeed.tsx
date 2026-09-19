"use client";

import { useEffect, useRef, useState } from "react";
import SnapCard from "@/components/friends/SnapCard";
import SnapViewer from "@/components/snaps/SnapViewer";
import type { PublicRecentSnap } from "@/lib/recent-snaps";

interface TelegramSnapFeedProps {
  snaps: PublicRecentSnap[];
  nextCursor?: string | null;
  loadingMore?: boolean;
  onLoadMore?: () => Promise<void> | void;
}

export default function TelegramSnapFeed({
  snaps,
  nextCursor = null,
  loadingMore = false,
  onLoadMore,
}: TelegramSnapFeedProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadMoreInFlightRef = useRef(false);
  const viewerSnap = viewerIndex !== null ? snaps[viewerIndex] : null;

  useEffect(() => {
    if (!onLoadMore || !nextCursor || loadingMore) return;

    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          !loadMoreInFlightRef.current
        ) {
          loadMoreInFlightRef.current = true;
          void Promise.resolve(onLoadMore()).finally(() => {
            loadMoreInFlightRef.current = false;
          });
        }
      },
      { rootMargin: "0px 0px 480px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadingMore, nextCursor, onLoadMore]);

  return (
    <>
      <section className="mb-8 sm:mb-10">
        <h2 className="mb-4 text-xl font-semibold text-foreground sm:text-2xl">
          Recent Snaps
        </h2>

        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          {snaps.map((snap, index) => (
            <SnapCard
              key={snap.id}
              id={snap.id}
              imageUrl={snap.imageUrl}
              caption={snap.caption}
              createdAt={snap.createdAt}
              friendName={snap.user.name}
              snapIndex={index}
              uploaderName={snap.uploadedBy?.name ?? null}
              interactive
              onClick={() => setViewerIndex(index)}
            />
          ))}
        </div>

        {onLoadMore ? (
          <div ref={loadMoreRef} className="mt-6 min-h-10 text-center" aria-live="polite">
            {loadingMore ? (
              <p className="text-sm text-muted-foreground">Loading more Snaps…</p>
            ) : nextCursor ? (
              <p className="text-xs text-muted-foreground">Scroll for more Snaps</p>
            ) : snaps.length > 0 ? (
              <p className="text-xs text-muted-foreground">You&apos;ve reached the end.</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {viewerSnap && viewerIndex !== null ? (
        <SnapViewer
          key={viewerSnap.id}
          isOpen
          onClose={() => setViewerIndex(null)}
          imageUrl={viewerSnap.imageUrl}
          caption={viewerSnap.caption}
          friendName={viewerSnap.user.name}
          snapIndex={viewerIndex}
          snapId={viewerSnap.id}
        />
      ) : null}
    </>
  );
}
