"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import SnapFormModal from "@/components/admin/SnapFormModal";
import { EditIcon, SearchIcon, TrashIcon } from "@/components/admin/icons";
import { useToast } from "@/components/admin/ToastProvider";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminSnap, AdminUser } from "@/lib/admin-types";
import { formatAdminDate } from "@/lib/admin-types";
import { adminFetch } from "@/lib/admin-client";

export default function SnapsPageClient() {
  const { showToast } = useToast();
  const [snaps, setSnaps] = useState<AdminSnap[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedSnap, setSelectedSnap] = useState<AdminSnap | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchSnaps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());

      const [snapsResponse, usersResponse] = await Promise.all([
        adminFetch(`/api/admin/snaps?${params.toString()}`),
        adminFetch("/api/admin/users"),
      ]);

      if (!snapsResponse.ok || !usersResponse.ok) {
        throw new Error("Failed to load snaps");
      }

      const snapsData = (await snapsResponse.json()) as { snaps: AdminSnap[] };
      const usersData = (await usersResponse.json()) as { users: AdminUser[] };

      setSnaps(snapsData.snaps);
      setUsers(usersData.users);
    } catch {
      showToast("Failed to load snaps", "error");
    } finally {
      setLoading(false);
    }
  }, [search, showToast]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchSnaps();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [fetchSnaps]);

  const handleEdit = async (data: { caption?: string; userId: string }) => {
    if (!selectedSnap) return;
    setFormLoading(true);
    setFormError(null);

    try {
      const response = await adminFetch(`/api/admin/snaps/${selectedSnap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: data.caption ?? null,
          userId: data.userId,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        snap?: AdminSnap;
      };

      if (!response.ok || !result.snap) {
        setFormError(result.error ?? "Failed to update snap");
        return;
      }

      setSnaps((current) =>
        current.map((snap) =>
          snap.id === result.snap!.id ? result.snap! : snap,
        ),
      );
      showToast("Snap updated successfully");
      setEditOpen(false);
    } catch {
      setFormError("An unexpected error occurred");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSnap) return;
    setDeleteLoading(true);

    try {
      const response = await adminFetch(`/api/admin/snaps/${selectedSnap.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        showToast(result.error ?? "Failed to delete snap", "error");
        return;
      }

      setSnaps((current) =>
        current.filter((snap) => snap.id !== selectedSnap.id),
      );
      showToast("Snap deleted successfully");
      setDeleteOpen(false);
      setSelectedSnap(null);
    } catch {
      showToast("Failed to delete snap", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Snaps</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Loading snaps..."
            : `${snaps.length} snap${snaps.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="relative max-w-xl">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search snaps..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-72 w-full rounded-2xl" />
          ))}
        </div>
      ) : snaps.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <h2 className="text-lg font-medium">No snaps found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            There are currently no snaps matching your search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {snaps.map((snap) => (
            <motion.article
              key={snap.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
            >
              <div className="relative aspect-[4/5] bg-muted">
                <Image
                  src={snap.imageUrl}
                  alt={snap.caption ?? `${snap.user.name}'s snap`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                />
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <Image
                    src={snap.user.profileImage}
                    alt={snap.user.name}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  <div>
                    <p className="text-sm font-medium">{snap.user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatAdminDate(snap.createdAt)}
                    </p>
                  </div>
                </div>
                {snap.caption && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {snap.caption}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSnap(snap);
                      setFormError(null);
                      setEditOpen(true);
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
                  >
                    <EditIcon />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSnap(snap);
                      setDeleteOpen(true);
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <TrashIcon />
                    Delete
                  </button>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      <SnapFormModal
        open={editOpen}
        snap={selectedSnap}
        users={users}
        loading={formLoading}
        error={formError}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEdit}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete snap?"
        description="This snap will be permanently removed."
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
