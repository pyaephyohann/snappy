"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import Modal from "@/components/admin/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAdminDate } from "@/lib/admin-types";

export type ProfilePhotoSnap = {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
};

interface ProfileSnapPickerProps {
  currentProfileImage: string;
  currentProfileImageSnapId: string | null;
  onClose: () => void;
  onSaved: (payload: {
    profileImage: string;
    profileImageSnapId: string;
  }) => void;
}

function SnapGrid({
  snaps,
  selectedSnapId,
  profileImage,
  saving,
  onSelect,
}: {
  snaps: ProfilePhotoSnap[];
  selectedSnapId: string | null;
  profileImage: string;
  saving: boolean;
  onSelect: (id: string) => void;
}) {
  if (snaps.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-10 text-center">
        <p className="text-sm font-medium text-foreground">
          Post a Snap first to use it as your profile photo.
        </p>
        <Link
          href="/home"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Go to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="grid max-h-[50vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
      {snaps.map((snap) => {
        const isSelected = selectedSnapId === snap.id;
        const isCurrentProfile = snap.imageUrl === profileImage;

        return (
          <button
            key={snap.id}
            type="button"
            disabled={saving}
            onClick={() => onSelect(snap.id)}
            className={`relative overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isSelected
                ? "border-primary ring-2 ring-primary/30"
                : "border-border hover:border-primary/40"
            }`}
            aria-label={
              isSelected
                ? `Selected snap${snap.caption ? `: ${snap.caption}` : ""}`
                : `Select snap${snap.caption ? `: ${snap.caption}` : ""}`
            }
            aria-pressed={isSelected}
          >
            <div className="relative aspect-square bg-muted">
              <Image
                src={snap.imageUrl}
                alt={snap.caption ?? "Your snap"}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, 160px"
              />
              {isSelected ? (
                <span className="absolute left-2 top-2 rounded-lg bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                  Selected
                </span>
              ) : null}
              {!isSelected && isCurrentProfile ? (
                <span className="absolute left-2 top-2 rounded-lg bg-background/90 px-2 py-1 text-xs font-medium">
                  Current
                </span>
              ) : null}
            </div>
            <div className="space-y-1 p-2">
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {snap.caption ?? "No caption"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatAdminDate(snap.createdAt)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PickerFooter({
  saving,
  canSave,
  onCancel,
  onSave,
}: {
  saving: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-border pt-4">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !canSave}
        className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function PickerBody(props: {
  loading: boolean;
  error: string | null;
  snaps: ProfilePhotoSnap[];
  selectedSnapId: string | null;
  profileImage: string | null;
  saving: boolean;
  hasChanges: boolean;
  onSelect: (id: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const {
    loading,
    error,
    snaps,
    selectedSnapId,
    profileImage,
    saving,
    hasChanges,
    onSelect,
    onCancel,
    onSave,
  } = props;

  return (
    <div className="space-y-4">
      {error ? (
        <div
          className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : (
        <SnapGrid
          snaps={snaps}
          selectedSnapId={selectedSnapId}
          profileImage={profileImage ?? ""}
          saving={saving}
          onSelect={onSelect}
        />
      )}

      <PickerFooter
        saving={saving}
        canSave={hasChanges && snaps.length > 0 && Boolean(selectedSnapId)}
        onCancel={onCancel}
        onSave={onSave}
      />
    </div>
  );
}

export default function ProfileSnapPicker({
  currentProfileImage,
  currentProfileImageSnapId,
  onClose,
  onSaved,
}: ProfileSnapPickerProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState(currentProfileImage);
  const [snaps, setSnaps] = useState<ProfilePhotoSnap[]>([]);
  const [selectedSnapId, setSelectedSnapId] = useState<string | null>(
    currentProfileImageSnapId,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/profile/profile-photo", {
          credentials: "include",
        });
        const result = (await response.json()) as {
          error?: string;
          user?: {
            profileImage: string;
            profileImageSnapId: string | null;
          };
          snaps?: ProfilePhotoSnap[];
        };

        if (cancelled) return;

        if (!response.ok) {
          throw new Error(result.error ?? "Failed to load your Snaps");
        }

        const nextSnaps = result.snaps ?? [];
        setSnaps(nextSnaps);
        setProfileImage(result.user?.profileImage ?? currentProfileImage);
        setSelectedSnapId(
          result.user?.profileImageSnapId ?? currentProfileImageSnapId,
        );
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load your Snaps",
        );
        setSnaps([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [currentProfileImage, currentProfileImageSnapId]);

  const selectedSnap = useMemo(
    () => snaps.find((snap) => snap.id === selectedSnapId) ?? null,
    [selectedSnapId, snaps],
  );

  const hasChanges =
    selectedSnap !== null &&
    (selectedSnap.id !== currentProfileImageSnapId ||
      selectedSnap.imageUrl !== currentProfileImage);

  const handleSave = async () => {
    if (!selectedSnapId || saving) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile/profile-photo", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapId: selectedSnapId }),
      });

      const result = (await response.json()) as {
        error?: string;
        profileImage?: string;
        profileImageSnapId?: string;
      };

      if (!response.ok || !result.profileImage || !result.profileImageSnapId) {
        throw new Error(result.error ?? "Failed to update profile photo");
      }

      onSaved({
        profileImage: result.profileImage,
        profileImageSnapId: result.profileImageSnapId,
      });
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to update profile photo",
      );
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <PickerBody
      loading={loading}
      error={error}
      snaps={snaps}
      selectedSnapId={selectedSnapId}
      profileImage={profileImage}
      saving={saving}
      hasChanges={hasChanges}
      onSelect={setSelectedSnapId}
      onCancel={() => {
        if (!saving) onClose();
      }}
      onSave={() => void handleSave()}
    />
  );

  return (
    <>
      <div className="hidden lg:block">
        <Modal
          open
          title="Choose from My Snaps"
          onClose={() => {
            if (!saving) onClose();
          }}
        >
          {body}
        </Modal>
      </div>

      <AnimatePresence>
        <div className="lg:hidden">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-black/60"
              aria-label="Close snap picker"
              onClick={() => {
                if (!saving) onClose();
              }}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
              className="fixed inset-x-0 bottom-0 z-[71] max-h-[88vh] overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-snap-picker-title"
            >
              <div className="safe-area-pb px-4 pb-4 pt-3">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
                <h2
                  id="profile-snap-picker-title"
                  className="mb-4 text-lg font-semibold text-foreground"
                >
                  Choose from My Snaps
                </h2>
                {body}
              </div>
            </motion.div>
        </div>
      </AnimatePresence>
    </>
  );
}
