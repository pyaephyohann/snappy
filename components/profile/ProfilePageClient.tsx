"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ProfileSnapPicker from "@/components/profile/ProfileSnapPicker";
import ProfileLogoutButton from "@/components/profile/ProfileLogoutButton";
import TelegramDisconnectButton from "@/components/profile/TelegramDisconnectButton";
import TelegramConnectButton from "@/components/telegram/TelegramConnectButton";
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
  profilePhotoGalleryUnlocked: boolean;
};

type EditField = "none" | "name" | "passcode";

export default function ProfilePageClient({
  initial,
  openPhotoPicker = false,
}: {
  initial: ProfilePageInitialData;
  openPhotoPicker?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [profileImage, setProfileImage] = useState(initial.profileImage);
  const [profileImageSnapId, setProfileImageSnapId] = useState(
    initial.profileImageSnapId,
  );
  const [pickerOpen, setPickerOpen] = useState(openPhotoPicker);
  const [editField, setEditField] = useState<EditField>("none");
  const [passcode, setPasscode] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const galleryUnlocked = initial.profilePhotoGalleryUnlocked;

  const savedName = name.trim() !== initial.name ? name.trim() : undefined;
  const trimmedPasscode = passcode.trim();
  const passcodeToSave =
    trimmedPasscode.length > 0 ? trimmedPasscode : undefined;

  const handleSaveProfile = async (field: "name" | "passcode" | "both") => {
    setSaving(true);
    setFormError(null);
    setFormSuccess(null);

    const payload: { name?: string; passcode?: string } = {};
    if (field === "name" || field === "both") {
      if (savedName) payload.name = savedName;
    }
    if (field === "passcode" || field === "both") {
      if (passcodeToSave) payload.passcode = passcodeToSave;
    }

    if (!payload.name && !payload.passcode) {
      setFormError("Enter a valid change before saving.");
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
      setEditField("none");
      setFormSuccess("Profile saved.");
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

            <div className="mt-5 flex justify-center lg:justify-start">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="min-h-[44px] rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted"
              >
                Change profile photo
              </button>
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

            {formError && editField === "none" ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Account information
              </h3>
              <dl className="mt-4 divide-y divide-border text-sm">
                <div className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <dt className="text-muted-foreground">Name</dt>
                    {editField === "name" ? (
                      <dd className="mt-2">
                        <input
                          id="profile-name"
                          type="text"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          autoComplete="name"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs"
                        />
                      </dd>
                    ) : (
                      <dd className="mt-1 font-medium text-foreground">{name}</dd>
                    )}
                  </div>
                  {editField === "name" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSaveProfile("name")}
                        className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setName(initial.name);
                          setEditField("none");
                          setFormError(null);
                        }}
                        className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditField("name");
                        setFormError(null);
                        setFormSuccess(null);
                      }}
                      className="min-h-[44px] shrink-0 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                    >
                      Edit
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <dt className="text-muted-foreground">Passcode</dt>
                    {editField === "passcode" ? (
                      <dd className="mt-2 space-y-2">
                        <input
                          id="profile-passcode"
                          type="password"
                          value={passcode}
                          onChange={(event) => setPasscode(event.target.value)}
                          autoComplete="new-password"
                          placeholder="New passcode"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                          At least 4 characters. Your current passcode is never
                          shown.
                        </p>
                      </dd>
                    ) : (
                      <dd className="mt-1 font-medium text-foreground">••••••••</dd>
                    )}
                  </div>
                  {editField === "passcode" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSaveProfile("passcode")}
                        className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setPasscode("");
                          setEditField("none");
                          setFormError(null);
                        }}
                        className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditField("passcode");
                        setFormError(null);
                        setFormSuccess(null);
                        setPasscode("");
                      }}
                      className="min-h-[44px] shrink-0 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                    >
                      Change
                    </button>
                  )}
                </div>
              </dl>
              {formError && editField !== "none" ? (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {formError}
                </p>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Telegram
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">
                {initial.telegramConnected
                  ? initial.telegramUsername
                    ? `Connected as @${initial.telegramUsername}`
                    : "Connected"
                  : "Not connected"}
              </p>
              <div className="mt-4">
                {initial.telegramConnected ? (
                  <TelegramDisconnectButton />
                ) : (
                  <TelegramConnectButton />
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Account
              </h3>
              <div className="mt-4">
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
          galleryUploadUnlocked={galleryUnlocked}
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
