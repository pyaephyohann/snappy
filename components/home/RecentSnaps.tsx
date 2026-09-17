"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import SnapViewer from "@/components/snaps/SnapViewer";
import type { PublicRecentSnap } from "@/lib/recent-snaps";

interface RecentSnapsProps {
  snaps: PublicRecentSnap[];
}

export default function RecentSnaps({ snaps }: RecentSnapsProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const viewerSnap = viewerIndex !== null ? snaps[viewerIndex] : null;

  return (
    <>
      <section className="mb-8 sm:mb-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
            Recent Snaps
          </h2>
          <Link
            href="/search"
            className="shrink-0 cursor-pointer text-sm font-medium text-primary hover:opacity-90"
          >
            View All →
          </Link>
        </div>

        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] sm:gap-4 [&::-webkit-scrollbar]:hidden">
          {snaps.map((snap, index) => (
            <motion.button
              key={snap.id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.25 }}
              onClick={() => setViewerIndex(index)}
              className="w-[7.5rem] shrink-0 cursor-pointer text-left sm:w-32"
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-muted shadow-sm">
                <Image
                  src={snap.imageUrl}
                  alt={snap.caption ?? `${snap.user.name}'s snap`}
                  fill
                  className="object-cover"
                  sizes="128px"
                />
              </div>
              <p className="mt-2 truncate text-center text-xs font-medium text-foreground sm:text-sm">
                {snap.user.name}
              </p>
            </motion.button>
          ))}
        </div>
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
