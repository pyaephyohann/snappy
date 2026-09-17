"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Modal from "@/components/admin/Modal";
import AdminSnapPicker from "@/components/admin/AdminSnapPicker";
import type { AdminUser } from "@/lib/admin-types";

const baseUserFormSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be less than 50 characters")
    .trim(),
  role: z.enum(["USER", "ADMIN"]),
  passcode: z
    .string()
    .max(128, "Passcode must be less than 128 characters")
    .optional(),
  isActive: z.boolean(),
});

type UserFormData = z.infer<typeof baseUserFormSchema>;

export type UserFormSubmitData = UserFormData & {
  profileImageSnapId?: string | null;
};

interface UserFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  user?: AdminUser | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (data: UserFormSubmitData) => Promise<void>;
}

function UserFormModalBody({
  mode,
  user,
  loading,
  error,
  onClose,
  onSubmit,
}: Omit<UserFormModalProps, "open">) {
  const [selectedSnapId, setSelectedSnapId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(
    user?.profileImage ?? null,
  );
  const [profileImageTouched, setProfileImageTouched] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(baseUserFormSchema),
    defaultValues: {
      name: user?.name ?? "",
      role: user?.role ?? "USER",
      passcode: "",
      isActive: user?.isActive ?? true,
    },
  });

  return (
    <form
      onSubmit={handleSubmit(async (data) => {
        const trimmedPasscode = data.passcode?.trim() ?? "";
        if (mode === "create" && trimmedPasscode.length < 4) {
          return;
        }
        if (
          mode === "edit" &&
          trimmedPasscode.length > 0 &&
          trimmedPasscode.length < 4
        ) {
          return;
        }

        await onSubmit({
          ...data,
          passcode: trimmedPasscode.length > 0 ? trimmedPasscode : undefined,
          ...(mode === "create" || profileImageTouched
            ? { profileImageSnapId: selectedSnapId }
            : {}),
        });
      })}
      className="space-y-4"
    >
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="text-sm font-medium">Profile image</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Select an existing Snap. No uploads.
        </p>
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative h-20 w-20 shrink-0 aspect-square overflow-hidden rounded-full bg-muted">
            <Image
              src={previewImage ?? user?.profileImage ?? "/anya.jpeg"}
              alt="Profile preview"
              fill
              className="object-cover"
              sizes="80px"
            />
          </div>
          <div className="min-w-0 flex-1">
            <AdminSnapPicker
              selectedSnapId={selectedSnapId}
              disabled={loading}
              onSelect={(snapId, imageUrl) => {
                setProfileImageTouched(true);
                setSelectedSnapId(snapId);
                if (imageUrl) {
                  setPreviewImage(imageUrl);
                } else if (user?.profileImage) {
                  setPreviewImage(user.profileImage);
                } else {
                  setPreviewImage(null);
                }
              }}
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          type="text"
          disabled={loading}
          {...register("name")}
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="passcode" className="mb-2 block text-sm font-medium">
          Passcode
        </label>
        <input
          id="passcode"
          type="password"
          placeholder={
            mode === "edit"
              ? "Leave blank to keep current passcode"
              : "Required — unique per user"
          }
          disabled={loading}
          {...register("passcode", {
            validate: (value) => {
              const trimmed = value?.trim() ?? "";
              if (mode === "create" && trimmed.length < 4) {
                return "Passcode must be at least 4 characters";
              }
              if (mode === "edit" && trimmed.length > 0 && trimmed.length < 4) {
                return "Passcode must be at least 4 characters";
              }
              return true;
            },
          })}
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.passcode && (
          <p className="mt-1 text-sm text-destructive">{errors.passcode.message}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <input
          id="isActive"
          type="checkbox"
          disabled={loading}
          {...register("isActive")}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="isActive" className="text-sm font-medium">
          Active (can sign in with passcode)
        </label>
      </div>

      <div>
        <label htmlFor="role" className="mb-2 block text-sm font-medium">
          Friend profile role
        </label>
        <select
          id="role"
          disabled={loading}
          {...register("role")}
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Controls how this friend appears in Snappy. App admin access still
          uses the admin passcode.
        </p>
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
          {loading ? "Saving..." : mode === "create" ? "Create User" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

export default function UserFormModal({
  open,
  mode,
  user,
  loading = false,
  error,
  onClose,
  onSubmit,
}: UserFormModalProps) {
  const formKey = `${mode}-${user?.id ?? "create"}`;

  return (
    <Modal
      open={open}
      title={mode === "create" ? "Create User" : "Edit User"}
      onClose={onClose}
    >
      {open ? (
        <UserFormModalBody
          key={formKey}
          mode={mode}
          user={user}
          loading={loading}
          error={error}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </Modal>
  );
}
