"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Modal from "@/components/admin/Modal";
import { SearchIcon } from "@/components/admin/icons";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminSnap } from "@/lib/admin-types";
import { formatAdminDate } from "@/lib/admin-types";
import { adminFetch } from "@/lib/admin-client";

interface HeroCarouselAddSnapModalProps {
  open: boolean;
  selectedSnapIds: Set<string>;
  addingSnapId: string | null;
  onClose: () => void;
  onSelect: (snapId: string) => void;
}

export default function HeroCarouselAddSnapModal({
  open,
  selectedSnapIds,
  addingSnapId,
  onClose,
  onSelect,
}: HeroCarouselAddSnapModalProps) {
  const [search, setSearch] = useState("");
  const [snaps, setSnaps] = useState<AdminSnap[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSnaps = useCallback(async () => {
    if (!open) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());

      const response = await adminFetch(`/api/admin/snaps?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load snaps");
      }

      const data = (await response.json()) as { snaps: AdminSnap[] };
      setSnaps(data.snaps);
    } catch {
      setSnaps([]);
    } finally {
      setLoading(false);
    }
  }, [open, search]);

  useEffect(() => {
    if (!open) return;

    const timeout = window.setTimeout(() => {
      void fetchSnaps();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [fetchSnaps, open]);

  const availableCount = useMemo(
    () => snaps.filter((snap) => !selectedSnapIds.has(snap.id)).length,
    [selectedSnapIds, snaps],
  );

  return (
    <Modal open={open} title="Add Existing Snap" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose a Snap to show in the user app HeroCarousel. Images are not
          copied or re-uploaded.
        </p>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by caption or user..."
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {!loading && snaps.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {availableCount} available · {selectedSnapIds.size} already selected
          </p>
        )}

        {loading ? (
          <div className="grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : snaps.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-8 text-center">
            <p className="text-sm font-medium">No Snaps found.</p>
          </div>
        ) : (
          <div className="grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            {snaps.map((snap) => {
              const alreadySelected = selectedSnapIds.has(snap.id);
              const isAdding = addingSnapId === snap.id;

              return (
                <button
                  key={snap.id}
                  type="button"
                  disabled={alreadySelected || addingSnapId !== null}
                  onClick={() => onSelect(snap.id)}
                  className={`overflow-hidden rounded-xl border text-left transition-colors ${
                    alreadySelected
                      ? "cursor-not-allowed border-border bg-muted/40 opacity-70"
                      : "border-border bg-card hover:border-primary/40 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60"
                  }`}
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    <Image
                      src={snap.imageUrl}
                      alt={snap.caption ?? `${snap.user.name}'s snap`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 320px"
                    />
                    {alreadySelected && (
                      <span className="absolute left-2 top-2 rounded-lg bg-background/90 px-2 py-1 text-xs font-medium">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="flex items-center gap-2">
                      <Image
                        src={snap.user.profileImage}
                        alt={snap.user.name}
                        width={24}
                        height={24}
                        className="h-6 w-6 shrink-0 rounded-full object-cover"
                      />
                      <span className="truncate text-sm font-medium">
                        {snap.user.name}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {snap.caption ?? "No caption"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatAdminDate(snap.createdAt)}
                    </p>
                    {isAdding && (
                      <p className="text-xs font-medium text-primary">Adding...</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
