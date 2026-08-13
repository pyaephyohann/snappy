"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import UserFormModal from "@/components/admin/UserFormModal";
import { EditIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/admin/icons";
import { useToast } from "@/components/admin/ToastProvider";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminUser } from "@/lib/admin-types";
import { formatAdminDate } from "@/lib/admin-types";
import { adminFetch } from "@/lib/admin-client";

type RoleFilter = "ALL" | "USER" | "ADMIN";

export default function UsersPageClient() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (roleFilter !== "ALL") params.set("role", roleFilter);

      const response = await adminFetch(`/api/admin/users?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load users");
      }

      const data = (await response.json()) as { users: AdminUser[] };
      setUsers(data.users);
    } catch {
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, showToast]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchUsers();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [fetchUsers]);

  const filteredCountLabel = useMemo(() => {
    if (loading) return "Loading users...";
    return `${users.length} user${users.length === 1 ? "" : "s"}`;
  }, [loading, users.length]);

  const openCreateModal = () => {
    setModalMode("create");
    setSelectedUser(null);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (user: AdminUser) => {
    setModalMode("edit");
    setSelectedUser(user);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (data: {
    name: string;
    role: "USER" | "ADMIN";
    passcode?: string;
  }) => {
    setFormLoading(true);
    setFormError(null);

    try {
      const response = await adminFetch(
        modalMode === "create"
          ? "/api/admin/users"
          : `/api/admin/users/${selectedUser?.id}`,
        {
          method: modalMode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setFormError(result.error ?? "Failed to save user");
        return;
      }

      showToast(
        modalMode === "create" ? "User created successfully" : "User updated successfully"
      );
      setModalOpen(false);
      await fetchUsers();
    } catch {
      setFormError("An unexpected error occurred");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    setDeleteLoading(true);

    try {
      const response = await adminFetch(`/api/admin/users/${selectedUser.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        showToast(result.error ?? "Failed to delete user", "error");
        return;
      }

      showToast("User deleted successfully");
      setDeleteOpen(false);
      setSelectedUser(null);
      await fetchUsers();
    } catch {
      showToast("Failed to delete user", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">{filteredCountLabel}</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <PlusIcon className="w-4 h-4" />
          Create User
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search users..."
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          {(["ALL", "USER", "ADMIN"] as RoleFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setRoleFilter(filter)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                roleFilter === filter
                  ? "bg-primary/10 text-primary"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {filter === "ALL" ? "All" : filter === "USER" ? "Users" : "Admins"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <h2 className="text-lg font-medium">No users yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first Snappy user.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <PlusIcon className="w-4 h-4" />
            Create User
          </button>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Snaps</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-muted/20"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Image
                          src={user.profileImage}
                          alt={user.name}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        user.role === "ADMIN"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{user.snapCount}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{formatAdminDate(user.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
                        >
                          <EditIcon />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUser(user);
                            setDeleteOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                        >
                          <TrashIcon />
                          Delete
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {users.map((user) => (
              <div key={user.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <Image
                    src={user.profileImage}
                    alt={user.name}
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.role} · {user.snapCount} snaps
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(user)}
                    className="flex-1 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(user);
                      setDeleteOpen(true);
                    }}
                    className="flex-1 rounded-xl border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <UserFormModal
        open={modalOpen}
        mode={modalMode}
        user={selectedUser}
        loading={formLoading}
        error={formError}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete user?"
        description={`Are you sure you want to delete "${selectedUser?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
