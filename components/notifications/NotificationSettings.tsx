"use client";

import { useEffect, useState } from "react";
import { GlowButton } from "@/components/ui/glow-button";
import {
  getExistingSubscription,
  getPushSupportStatus,
  subscribeToWebPush,
  syncExistingPushSubscriptionToServer,
  unsubscribeFromWebPush,
} from "@/lib/push-client";

type UiState =
  | "loading"
  | "unsupported"
  | "missing-vapid"
  | "disabled"
  | "enabled"
  | "denied";

export default function NotificationSettings() {
  const [uiState, setUiState] = useState<UiState>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const support = getPushSupportStatus();
      if (support === "unsupported") {
        if (!cancelled) {
          setUiState("unsupported");
        }
        return;
      }

      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "denied"
      ) {
        if (!cancelled) {
          setUiState("denied");
        }
        return;
      }

      const vapidCheck = await fetch("/api/notifications/vapid-public-key");
      if (!vapidCheck.ok) {
        if (!cancelled) {
          setUiState("missing-vapid");
        }
        return;
      }

      const subscription = await getExistingSubscription();
      if (subscription) {
        await syncExistingPushSubscriptionToServer();
      }
      if (!cancelled) {
        setUiState(subscription ? "enabled" : "disabled");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await subscribeToWebPush();
      if (result === "granted") {
        setUiState("enabled");
        setMessage("Notifications enabled for this device.");
      } else if (result === "denied") {
        setUiState("denied");
        setMessage("Notifications are blocked in your browser settings.");
      } else if (result === "missing-vapid") {
        setUiState("missing-vapid");
        setMessage("Push notifications are not configured on the server yet.");
      } else {
        setMessage("Could not enable notifications. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await unsubscribeFromWebPush();
      setUiState("disabled");
      setMessage("Notifications disabled for this device.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8 rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Get notified when someone adds a Snap to your profile.
      </p>

      <div className="mt-4">
        {uiState === "loading" ? (
          <p className="text-sm text-muted-foreground">Checking notification status…</p>
        ) : null}

        {uiState === "unsupported" ? (
          <p className="text-sm text-muted-foreground">
            Web Push is not supported in this browser. Install Snappy as a PWA on
            iOS 16.4+ or use a modern Android browser for the best experience.
          </p>
        ) : null}

        {uiState === "missing-vapid" ? (
          <p className="text-sm text-muted-foreground">
            Push notifications are not available until the server is configured with
            VAPID keys.
          </p>
        ) : null}

        {uiState === "denied" ? (
          <p className="text-sm text-muted-foreground">
            Notifications are blocked. Enable them in your browser or device settings
            if you want Snappy alerts.
          </p>
        ) : null}

        {uiState === "disabled" || uiState === "enabled" ? (
          <div className="flex w-full flex-col items-center">
            {uiState === "disabled" ? (
              <GlowButton
                type="button"
                disabled={busy}
                onClick={() => void handleEnable()}
                className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enable Notifications
              </GlowButton>
            ) : (
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-center">
                <span className="text-center text-sm font-medium text-primary">
                  Notifications enabled on this device
                </span>
                <GlowButton
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDisable()}
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Disable Notifications
                </GlowButton>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {message ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
