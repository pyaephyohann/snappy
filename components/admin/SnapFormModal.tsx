"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Modal from "@/components/admin/Modal";
import type { AdminSnap, AdminUser } from "@/lib/admin-types";

const snapFormSchema = z.object({
  caption: z
    .string()
    .max(500, "Caption must be less than 500 characters")
    .optional(),
  userId: z.string().min(1, "User is required"),
});

type SnapFormData = z.infer<typeof snapFormSchema>;

interface SnapFormModalProps {
  open: boolean;
  snap: AdminSnap | null;
  users: AdminUser[];
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (data: SnapFormData) => Promise<void>;
}

export default function SnapFormModal({
  open,
  snap,
  users,
  loading = false,
  error,
  onClose,
  onSubmit,
}: SnapFormModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SnapFormData>({
    resolver: zodResolver(snapFormSchema),
    defaultValues: {
      caption: "",
      userId: "",
    },
  });

  useEffect(() => {
    if (open && snap) {
      reset({
        caption: snap.caption ?? "",
        userId: snap.userId,
      });
    }
  }, [open, snap, reset]);

  if (!snap) return null;

  return (
    <Modal open={open} title="Edit Snap" onClose={onClose}>
      <form
        onSubmit={handleSubmit(async (data) => {
          await onSubmit(data);
        })}
        className="space-y-4"
      >
        <div className="overflow-hidden rounded-xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snap.imageUrl}
            alt={snap.caption ?? "Snap preview"}
            className="h-48 w-full object-cover"
          />
        </div>

        <div>
          <label htmlFor="userId" className="mb-2 block text-sm font-medium">
            Owner
          </label>
          <select
            id="userId"
            disabled={loading}
            {...register("userId")}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          {errors.userId && (
            <p className="mt-1 text-sm text-destructive">{errors.userId.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="caption" className="mb-2 block text-sm font-medium">
            Caption
          </label>
          <textarea
            id="caption"
            rows={3}
            disabled={loading}
            {...register("caption")}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {errors.caption && (
            <p className="mt-1 text-sm text-destructive">{errors.caption.message}</p>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
