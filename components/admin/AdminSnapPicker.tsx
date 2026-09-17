"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import { adminFetch } from "@/lib/admin-client";
import type { AdminSnap } from "@/lib/admin-types";

interface AdminSnapPickerProps {
  selectedSnapId: string | null;
  onSelect: (snapId: string | null, imageUrl: string | null) => void;
  disabled?: boolean;
}

export default function AdminSnapPicker({
  selectedSnapId,
  onSelect,
  disabled = false,
}: AdminSnapPickerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snaps, setSnaps] = useState<AdminSnap[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadSnaps() {
      setLoading(true);
      setError(null);
      try {
        const response = await adminFetch("/api/admin/snaps");
        const result = (await response.json()) as {
          error?: string;
          snaps?: AdminSnap[];
        };
        if (!response.ok) {
          throw new Error(result.error ?? "Failed to load snaps");
        }
        if (!cancelled) {
          setSnaps(result.snaps ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load snaps",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSnaps();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (snaps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No snaps available yet. You can create the user without a profile image.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {snaps.map((snap) => {
          const selected = selectedSnapId === snap.id;
          return (
            <button
              key={snap.id}
              type="button"
              disabled={disabled}
              onClick={() =>
                onSelect(
                  selected ? null : snap.id,
                  selected ? null : snap.imageUrl,
                )
              }
              className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                selected
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-transparent hover:border-border"
              }`}
              aria-pressed={selected}
              aria-label={`Select snap by ${snap.user.name}`}
            >
              <Image
                src={snap.imageUrl}
                alt={snap.caption ?? `Snap by ${snap.user.name}`}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 33vw, 120px"
              />
            </button>
          );
        })}
      </div>
      {selectedSnapId ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect(null, null)}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Clear selection
        </button>
      ) : null}
    </div>
  );
}
