"use client";

import { useState } from "react";
import SnapCard from "@/components/friends/SnapCard";
import SnapViewer from "@/components/snaps/SnapViewer";
import { GlowButton } from "@/components/ui/glow-button";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const viewerSnap = viewerIndex !== null ? snaps[viewerIndex] : null;

  const handleLoadMore = async () => {
    if (!onLoadMore || loadingMore || !nextCursor) return;

    setLoadError(null);
    try {
      await onLoadMore();
    } catch {
      setLoadError("Could not load more Snaps. Please try again.");
    }
  };

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
          <div className="mt-6 flex min-h-10 flex-col items-center justify-center gap-2 text-center" aria-live="polite">
            {loadError ? (
              <p className="text-sm text-destructive" role="alert">
                {loadError}
              </p>
            ) : null}
            {nextCursor ? (
              <GlowButton
                type="button"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
                className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </GlowButton>
            ) : (
              <p className="text-xs text-muted-foreground">No more Snaps</p>
            )}
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
