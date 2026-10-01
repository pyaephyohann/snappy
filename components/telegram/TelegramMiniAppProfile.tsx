"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ProfilePageClient from "@/components/profile/ProfilePageClient";
import TelegramMiniAppReconnect from "@/components/telegram/TelegramMiniAppReconnect";
import { useTelegramMiniAppAuth } from "@/components/telegram/TelegramMiniAppAuthProvider";
import { TELEGRAM_MINI_APP_ROUTES } from "@/lib/telegram/mini-app-routes";
import type { MiniAppProfilePayload } from "@/lib/telegram/mini-app-profile";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; profile: MiniAppProfilePayload }
  | { status: "error" }
  | { status: "session_expired" };

export default function TelegramMiniAppProfile() {
  const { retryAuth } = useTelegramMiniAppAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadProfile = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/telegram/mini-app/profile", {
        credentials: "include",
      });
      if (response.status === 401) {
        setState({ status: "session_expired" });
        return;
      }
      if (!response.ok) throw new Error("request_failed");
      setState({
        status: "ready",
        profile: (await response.json()) as MiniAppProfilePayload,
      });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadProfile();
    });
  }, [loadProfile]);

  if (state.status === "loading") {
    return <ProfileSkeleton />;
  }
  if (state.status === "session_expired") {
    return <div className="px-4 pt-10"><TelegramMiniAppReconnect onReconnect={() => retryAuth()} /></div>;
  }
  if (state.status === "error") {
    return (
      <div className="px-4 pt-10 text-center">
        <p className="text-sm text-muted-foreground">Unable to load your profile.</p>
        <button type="button" className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={() => void loadProfile()}>Try Again</button>
      </div>
    );
  }

  const { profile } = state;
  return (
    <div className="px-4 pb-8 pt-4">
      {/* Friends entry (mutual follows) — opens the Mini App Friends screen */}
      <section aria-label="Friends" className="mb-4">
        <Link
          href={TELEGRAM_MINI_APP_ROUTES.friends}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden>👥</span>
            <span className="font-medium text-foreground">Friends</span>
          </span>
          <span className="text-muted-foreground" aria-hidden>
            →
          </span>
        </Link>
      </section>

      <ProfilePageClient
        initial={{
          id: profile.id,
          name: profile.name,
          profileImage: profile.profileImage,
          profileImageSnapId: profile.profileImageSnapId,
          snapCount: profile.snapCount,
          createdAt: profile.createdAt,
          lastLoginAt: profile.lastLoginAt,
          telegramConnected: profile.telegramConnected,
          telegramUsername: profile.telegramUsername,
          profilePhotoGalleryUnlocked: profile.profilePhotoGalleryUnlocked,
          uploadedSnaps: profile.uploadedSnaps,
        }}
        homeHref="/telegram/app"
      />
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="px-4 pt-8" aria-busy="true" aria-label="Loading profile">
      <div className="mx-auto max-w-md animate-pulse text-center">
        <div className="mx-auto h-28 w-28 rounded-full bg-muted" />
        <div className="mx-auto mt-4 h-6 w-40 rounded bg-muted" />
        <div className="mx-auto mt-2 h-4 w-28 rounded bg-muted" />
        <div className="mt-8 h-48 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
