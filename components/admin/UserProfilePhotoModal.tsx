"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Modal from "@/components/admin/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminUser } from "@/lib/admin-types";
import { formatAdminDate } from "@/lib/admin-types";
import { adminFetch } from "@/lib/admin-client";

interface ProfilePhotoSnap {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
}

interface UserProfilePhotoModalProps {
  open: boolean;
  user: AdminUser | null;
  loading?: boolean;
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
}

export default function UserProfilePhotoModal({
  open,
  user,
  loading: externalLoading = false,
  onClose,
  onSaved,
}: UserProfilePhotoModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [snaps, setSnaps] = useState<ProfilePhotoSnap[]>([]);
  const [selectedSnapId, setSelectedSnapId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;

    const activeUser = user;
    let cancelled = false;

    async function loadOptions() {
      setLoading(true);
      setError(null);

      try {
        const response = await adminFetch(
          `/api/admin/users/${activeUser.id}/profile-photo`,
        );

        if (cancelled) return;

        const result = (await response.json()) as {
          error?: string;
          user?: { profileImage: string };
          snaps?: ProfilePhotoSnap[];
        };

        if (!response.ok) {
          throw new Error(result.error ?? "Failed to load images");
        }

        const nextSnaps = result.snaps ?? [];
        const currentProfileImage =
          result.user?.profileImage ?? activeUser.profileImage;

        setSnaps(nextSnaps);
        setProfileImage(currentProfileImage);

        const matchingSnap = nextSnaps.find(
          (snap) => snap.imageUrl === currentProfileImage,
        );
        setSelectedSnapId(matchingSnap?.id ?? null);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load profile photo options",
        );
        setSnaps([]);
        setSelectedSnapId(null);
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
  }, [open, user]);

  const selectedSnap = useMemo(
    () => snaps.find((snap) => snap.id === selectedSnapId) ?? null,
    [selectedSnapId, snaps],
  );

  const hasChanges =
    selectedSnap !== null && selectedSnap.imageUrl !== profileImage;

  const handleSave = async () => {
    if (!user || !selectedSnapId || saving) return;

    setSaving(true);
    setError(null);

    try {
      const response = await adminFetch(
        `/api/admin/users/${user.id}/profile-photo`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapId: selectedSnapId }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
        user?: AdminUser;
      };

      if (!response.ok || !result.user) {
        throw new Error(result.error ?? "Failed to update profile photo");
      }

      onSaved(result.user);
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

  const currentPhotoSrc = profileImage ?? user?.profileImage ?? null;

  return (
    <Modal
      open={open}
      title="Choose Profile Photo"
      onClose={() => {
        if (saving) return;
        onClose();
      }}
    >
      <div className="space-y-5">
        {user && (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/20 p-4">
            {currentPhotoSrc ? (
              <div className="relative h-[72px] w-[72px] shrink-0 aspect-square overflow-hidden rounded-full bg-muted">
                <Image
                  src={currentPhotoSrc}
                  alt={`${user.name}'s current profile photo`}
                  fill
                  className="object-cover"
                  sizes="72px"
                />
              </div>
            ) : (
              <div className="h-[72px] w-[72px] shrink-0 aspect-square rounded-full bg-muted" />
            )}
            <div>
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">
                Current profile photo
                {selectedSnap?.imageUrl === currentPhotoSrc
                  ? " · selected below"
                  : ""}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div
            className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : snaps.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-10 text-center">
            <p className="text-sm font-medium">
              This user has no existing images
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              that can be used as a profile photo.
            </p>
          </div>
        ) : (
          <div className="grid max-h-[50vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {snaps.map((snap) => {
              const isSelected = selectedSnapId === snap.id;
              const isCurrentProfile = snap.imageUrl === profileImage;

              return (
                <button
                  key={snap.id}
                  type="button"
                  disabled={saving || externalLoading}
                  onClick={() => setSelectedSnapId(snap.id)}
                  className={`relative overflow-hidden rounded-xl border text-left transition-colors ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="relative aspect-square bg-muted">
                    <Image
                      src={snap.imageUrl}
                      alt={snap.caption ?? "User snap"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 160px"
                    />
                    {isSelected && (
                      <span className="absolute left-2 top-2 rounded-lg bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                        Selected
                      </span>
                    )}
                    {!isSelected && isCurrentProfile && (
                      <span className="absolute left-2 top-2 rounded-lg bg-background/90 px-2 py-1 text-xs font-medium">
                        Current
                      </span>
                    )}
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
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={
              saving ||
              externalLoading ||
              !selectedSnapId ||
              snaps.length === 0 ||
              !hasChanges
            }
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
