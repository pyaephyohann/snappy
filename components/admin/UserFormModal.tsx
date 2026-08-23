"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Modal from "@/components/admin/Modal";
import type { AdminUser } from "@/lib/admin-types";

const userFormSchema = z.object({
  name: z
    .string()
    .min(2, "Username must be at least 2 characters")
    .max(50, "Username must be less than 50 characters")
    .trim(),
  role: z.enum(["USER", "ADMIN"]),
  passcode: z
    .string()
    .max(128, "Passcode must be less than 128 characters")
    .optional()
    .refine((value) => !value || value.length >= 4, {
      message: "Passcode must be at least 4 characters",
    }),
});

type UserFormData = z.infer<typeof userFormSchema>;

interface UserFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  user?: AdminUser | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (data: UserFormData) => Promise<void>;
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
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: "",
      role: "USER",
      passcode: "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: user?.name ?? "",
        role: user?.role ?? "USER",
        passcode: "",
      });
    }
  }, [open, user, reset]);

  return (
    <Modal
      open={open}
      title={mode === "create" ? "Create User" : "Edit User"}
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit(async (data) => {
          await onSubmit({
            ...data,
            passcode: data.passcode?.trim() ? data.passcode.trim() : undefined,
          });
        })}
        className="space-y-4"
      >
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium">
            Username
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
            placeholder={mode === "edit" ? "Leave blank to keep current passcode" : "Optional shared passcode"}
            disabled={loading}
            {...register("passcode")}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Snappy uses a shared passcode for all users. Updating this changes the global login passcode.
          </p>
          {errors.passcode && (
            <p className="mt-1 text-sm text-destructive">{errors.passcode.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="role" className="mb-2 block text-sm font-medium">
            Role
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
    </Modal>
  );
}
