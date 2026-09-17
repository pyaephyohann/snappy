"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTelegramMiniAppAuth } from "@/components/telegram/TelegramMiniAppAuthProvider";
import { GlowButton } from "@/components/ui/glow-button";
import { useTelegramBackButton } from "@/hooks/useTelegramBackButton";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import type { MiniAppProfilePayload } from "@/lib/telegram/mini-app-profile";
import { TELEGRAM_MINI_APP_ROUTES } from "@/lib/telegram/mini-app-routes";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; profile: MiniAppProfilePayload }
  | { status: "error" }
  | { status: "session_expired" };

export default function TelegramMiniAppProfile() {
  const router = useRouter();
  const { openExternalLink, retryAuth, state: authState } =
    useTelegramMiniAppAuth();
  const { initData } = useTelegramWebApp();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoadState({ status: "loading" });
    setActionError(null);
    try {
      const response = await fetch("/api/telegram/mini-app/profile", {
        credentials: "include",
      });
      if (response.status === 401) {
        setLoadState({ status: "session_expired" });
        return;
      }
      if (!response.ok) {
        setLoadState({ status: "error" });
        return;
      }
      const profile = (await response.json()) as MiniAppProfilePayload;
      setLoadState({ status: "ready", profile });
    } catch {
      setLoadState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadProfile();
    });
  }, [loadProfile]);

  const handleBack = useCallback(() => {
    if (confirmDisconnect) {
      setConfirmDisconnect(false);
      return;
    }
    router.push(TELEGRAM_MINI_APP_ROUTES.home);
  }, [confirmDisconnect, router]);

  useTelegramBackButton({ enabled: true, onBack: handleBack });

  const profileUrl =
    authState.status === "linked" && authState.session.snappyUrl
      ? `${authState.session.snappyUrl.replace(/\/$/, "")}/profile`
      : "/profile";

  const onDisconnect = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const response = await fetch("/api/telegram/unlink", {
        method: "POST",
        credentials: "include",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setActionError(data.error ?? "Unable to disconnect.");
        return;
      }
      setConfirmDisconnect(false);
      await loadProfile();
    } catch {
      setActionError("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const onConnect = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      if (initData.trim()) {
        const response = await fetch("/api/telegram/mini-app/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ initData }),
        });
        const data = (await response.json()) as { error?: string };
        if (response.ok) {
          await loadProfile();
          retryAuth();
          return;
        }
        setActionError(data.error ?? "Unable to connect Telegram.");
        return;
      }

      setActionError("Telegram identity is unavailable. Try Connect via Snappy web.");
    } catch {
      setActionError("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const openBrowserConnect = async () => {
    if (!initData.trim()) {
      setActionError("Open this Mini App from Telegram to connect.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const validated = await fetch("/api/telegram/mini-app/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData }),
      });
      const body = (await validated.json()) as { connectUrl?: string | null };
      if (body.connectUrl) {
        openExternalLink(body.connectUrl);
        return;
      }
      setActionError("Unable to start connection flow.");
    } catch {
      setActionError("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loadState.status === "loading") {
    return <ProfileSkeleton />;
  }

  if (loadState.status === "session_expired") {
    return (
      <CenteredMessage
        title="Your Snappy session has expired."
        actionLabel="Reconnect"
        onAction={() => retryAuth()}
      />
    );
  }

  if (loadState.status === "error") {
    return (
      <CenteredMessage
        title="Unable to load your profile."
        actionLabel="Try Again"
        onAction={() => void loadProfile()}
      />
    );
  }

  const { profile } = loadState;
  const memberSince = new Date(profile.memberSince).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="px-4 pb-8">
      <div className="mx-auto max-w-md pt-4 text-center">
        <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-full bg-muted ring-2 ring-border">
          <Image
            src={profile.profileImageUrl}
            alt={`${profile.displayName}'s profile`}
            fill
            className="object-cover"
            sizes="96px"
          />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">
          {profile.displayName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">@{profile.displayName}</p>
        <p className="mt-4 text-sm text-foreground">
          Your Snaps:{" "}
          <span className="font-semibold">{profile.snapCount}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Member since {memberSince}
        </p>
      </div>

      <section className="mx-auto mt-8 max-w-md rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Account</h2>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Telegram</p>
            {profile.telegram.connected ? (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="text-emerald-500" aria-hidden>
                  ●
                </span>{" "}
                Connected
                {profile.telegram.username
                  ? ` · @${profile.telegram.username}`
                  : null}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="text-muted-foreground" aria-hidden>
                  ○
                </span>{" "}
                Not connected
              </p>
            )}
          </div>
        </div>

        {actionError ? (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {actionError}
          </p>
        ) : null}

        <div className="mt-4">
          {profile.telegram.connected ? (
            <GlowButton
              type="button"
              disabled={actionLoading}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"
              onClick={() => setConfirmDisconnect(true)}
            >
              Disconnect Telegram
            </GlowButton>
          ) : (
            <div className="space-y-2">
              <GlowButton
                type="button"
                disabled={actionLoading || !initData.trim()}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                onClick={() => void onConnect()}
              >
                Connect Telegram
              </GlowButton>
              <GlowButton
                type="button"
                disabled={actionLoading}
                className="w-full rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground"
                onClick={() => void openBrowserConnect()}
              >
                Connect via Snappy web
              </GlowButton>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto mt-8 max-w-md">
        <GlowButton
          type="button"
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
          onClick={() => openExternalLink(profileUrl)}
        >
          Open Full Profile
        </GlowButton>
      </div>

      {confirmDisconnect ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disconnect-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg">
            <h3 id="disconnect-title" className="text-lg font-semibold text-foreground">
              Disconnect Telegram?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your Telegram account will no longer be linked to this Snappy
              account.
            </p>
            <div className="mt-6 flex gap-2">
              <GlowButton
                type="button"
                className="flex-1 rounded-xl border border-border bg-card px-4 py-2 text-sm text-foreground"
                onClick={() => setConfirmDisconnect(false)}
              >
                Cancel
              </GlowButton>
              <GlowButton
                type="button"
                disabled={actionLoading}
                className="flex-1 rounded-xl bg-destructive px-4 py-2 text-sm text-destructive-foreground"
                onClick={() => void onDisconnect()}
              >
                {actionLoading ? "Disconnecting…" : "Disconnect"}
              </GlowButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="px-4 pt-8" aria-busy="true" aria-label="Loading profile">
      <div className="mx-auto max-w-md animate-pulse text-center">
        <div className="mx-auto h-24 w-24 rounded-full bg-muted" />
        <div className="mx-auto mt-4 h-6 w-40 rounded bg-muted" />
        <div className="mx-auto mt-2 h-4 w-28 rounded bg-muted" />
        <div className="mx-auto mt-6 h-4 w-32 rounded bg-muted" />
        <div className="mt-8 h-36 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

function CenteredMessage({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-foreground">{title}</p>
      <GlowButton
        type="button"
        className="mt-6 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
        onClick={onAction}
      >
        {actionLabel}
      </GlowButton>
    </div>
  );
}
