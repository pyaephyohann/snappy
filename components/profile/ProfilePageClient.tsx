"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ProfileSnapPicker from "@/components/profile/ProfileSnapPicker";
import ProfileLogoutButton from "@/components/profile/ProfileLogoutButton";
import TelegramDisconnectButton from "@/components/profile/TelegramDisconnectButton";
import { formatAdminDate } from "@/lib/admin-types";

export type ProfilePageInitialData = {
  id: string;
  name: string;
  profileImage: string;
  profileImageSnapId: string | null;
  snapCount: number;
  createdAt: string;
  lastLoginAt: string | null;
  telegramConnected: boolean;
  telegramUsername: string | null;
};

export default function ProfilePageClient({
  initial,
}: {
  initial: ProfilePageInitialData;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [profileImage, setProfileImage] = useState(initial.profileImage);
  const [profileImageSnapId, setProfileImageSnapId] = useState(
    initial.profileImageSnapId,
  );
  const [editOpen, setEditOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const handleSaveProfile = async () => {
    setSaving(true);
    setFormError(null);
    setFormSuccess(null);

    const payload: { name?: string; passcode?: string } = {};
    const trimmedName = name.trim();
    if (trimmedName !== initial.name) {
      payload.name = trimmedName;
    }
    const trimmedPasscode = passcode.trim();
    if (trimmedPasscode.length > 0) {
      payload.passcode = trimmedPasscode;
    }

    if (!payload.name && !payload.passcode) {
      setFormError("Change your name or enter a new passcode to save.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        error?: string;
        user?: { name: string };
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to update profile");
      }

      if (result.user?.name) {
        setName(result.user.name);
      }
      setPasscode("");
      setFormSuccess("Profile saved.");
      setEditOpen(false);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to update profile",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mx-auto max-w-5xl">
        <div className="lg:grid lg:grid-cols-[minmax(0,280px)_1fr] lg:items-start lg:gap-10">
          <header className="text-center lg:sticky lg:top-24 lg:text-left">
            <motion.div
              className="relative mx-auto h-28 w-28 overflow-hidden rounded-full bg-muted ring-2 ring-border lg:mx-0 lg:h-32 lg:w-32"
              layout
            >
              <Image
                src={profileImage}
                alt={`${name}'s profile`}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 112px, 128px"
                priority
              />
            </motion.div>
            <h2 className="mt-4 text-2xl font-semibold text-foreground">{name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Snappy member since {formatAdminDate(initial.createdAt)}
            </p>
            {initial.snapCount > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {initial.snapCount} snap{initial.snapCount === 1 ? "" : "s"}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center lg:justify-start">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="min-h-[44px] rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted"
              >
                Change profile photo
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditOpen((value) => !value);
                  setFormError(null);
                  setFormSuccess(null);
                }}
                className="min-h-[44px] rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {editOpen ? "Close edit" : "Edit profile"}
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-left">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Upload a new photo
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Premium — use KPay, AYA Pay, or UAB Pay (coming soon).
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Premium
                </span>
              </div>
              <Link
                href="/profile/payment?feature=profile-photo"
                className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border bg-card text-sm font-medium hover:bg-muted sm:w-auto sm:px-4"
              >
                Upload a new photo
              </Link>
            </div>
          </header>

          <div className="mt-8 space-y-6 lg:mt-0">
            {formSuccess ? (
              <p
                className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground"
                role="status"
              >
                {formSuccess}
              </p>
            ) : null}

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Profile
              </h3>
              <dl className="mt-4 space-y-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="font-medium text-foreground">{name}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Last sign-in</dt>
                  <dd className="font-medium text-foreground">
                    {initial.lastLoginAt
                      ? formatAdminDate(initial.lastLoginAt)
                      : "Just now"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Telegram</dt>
                  <dd className="font-medium text-foreground">
                    {initial.telegramConnected
                      ? initial.telegramUsername
                        ? `@${initial.telegramUsername}`
                        : "Connected"
                      : "Not connected"}
                  </dd>
                </div>
              </dl>
            </section>

            {editOpen ? (
              <section
                className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
                aria-labelledby="edit-profile-heading"
              >
                <h3
                  id="edit-profile-heading"
                  className="text-lg font-semibold text-foreground"
                >
                  Edit profile
                </h3>
                {formError ? (
                  <p className="mt-3 text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                ) : null}
                <div className="mt-4 space-y-4">
                  <div>
                    <label
                      htmlFor="profile-name"
                      className="mb-1.5 block text-sm font-medium text-foreground"
                    >
                      Name
                    </label>
                    <input
                      id="profile-name"
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="profile-passcode"
                      className="mb-1.5 block text-sm font-medium text-foreground"
                    >
                      New passcode
                    </label>
                    <input
                      id="profile-passcode"
                      type="password"
                      value={passcode}
                      onChange={(event) => setPasscode(event.target.value)}
                      autoComplete="new-password"
                      placeholder="Leave blank to keep current passcode"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      At least 4 characters. Your current passcode is never
                      shown.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveProfile()}
                    className="min-h-[44px] w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:w-auto"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Account
              </h3>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setEditOpen(true);
                      setFormError(null);
                    }}
                    className="min-h-[44px] w-full rounded-xl px-2 py-2 text-left font-medium hover:bg-muted"
                  >
                    Edit profile
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setEditOpen(true);
                      setFormError(null);
                      setPasscode("");
                    }}
                    className="min-h-[44px] w-full rounded-xl px-2 py-2 text-left font-medium hover:bg-muted"
                  >
                    Change passcode
                  </button>
                </li>
              </ul>
              {initial.telegramConnected ? (
                <div className="mt-4 border-t border-border pt-4">
                  <TelegramDisconnectButton />
                </div>
              ) : null}
              <div className="mt-4 border-t border-border pt-4">
                <ProfileLogoutButton variant="destructive" />
              </div>
            </section>
          </div>
        </div>
      </div>

      {pickerOpen ? (
        <ProfileSnapPicker
          currentProfileImage={profileImage}
          currentProfileImageSnapId={profileImageSnapId}
          onClose={() => setPickerOpen(false)}
          onSaved={({
            profileImage: nextImage,
            profileImageSnapId: nextSnapId,
          }) => {
            setProfileImage(nextImage);
            setProfileImageSnapId(nextSnapId);
            setFormSuccess("Profile photo updated.");
            setPickerOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
