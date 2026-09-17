"use client";

import { useTelegramMiniAppAuth } from "@/components/telegram/TelegramMiniAppAuthProvider";
import { GlowButton } from "@/components/ui/glow-button";

export default function TelegramMiniAppProfile() {
  const { state, openExternalLink } = useTelegramMiniAppAuth();

  if (state.status !== "linked") {
    return null;
  }

  const { session } = state;
  const displayHandle = session.telegramUsername
    ? `@${session.telegramUsername}`
    : session.snappyUserName;

  const profileUrl = session.snappyUrl
    ? `${session.snappyUrl.replace(/\/$/, "")}/profile`
    : "/profile";

  return (
    <div className="flex min-h-[50vh] flex-col items-center px-6 pt-8 text-center">
      <p className="text-4xl" aria-hidden>
        👤
      </p>
      <h1 className="mt-4 text-xl font-semibold text-foreground">Profile</h1>
      <p className="mt-4 font-medium text-foreground">{displayHandle}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Snappy account: {session.snappyUserName}
      </p>
      <div className="mt-10 w-full max-w-xs">
        <GlowButton
          type="button"
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
          onClick={() => openExternalLink(profileUrl)}
        >
          Open Profile
        </GlowButton>
      </div>
    </div>
  );
}
