"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import TelegramMiniAppShell from "@/components/telegram/TelegramMiniAppShell";
import { GlowButton } from "@/components/ui/glow-button";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";

type LinkedSession = {
  linked: true;
  snappyUserName: string;
  telegramUsername: string | null;
  snappyUrl: string | null;
};

type UnlinkedSession = {
  linked: false;
  connectUrl: string | null;
  telegramUsername: string | null;
};

type AuthState =
  | { status: "booting" }
  | { status: "outside_telegram" }
  | { status: "error"; message: string }
  | { status: "unlinked"; session: UnlinkedSession }
  | { status: "linked"; session: LinkedSession };

type TelegramMiniAppAuthContextValue = {
  state: AuthState;
  retryAuth: () => void;
  openExternalLink: (url: string) => void;
};

const TelegramMiniAppAuthContext =
  createContext<TelegramMiniAppAuthContextValue | null>(null);

export function useTelegramMiniAppAuth(): TelegramMiniAppAuthContextValue {
  const value = useContext(TelegramMiniAppAuthContext);
  if (!value) {
    throw new Error("useTelegramMiniAppAuth must be used within provider");
  }
  return value;
}

export function TelegramMiniAppAuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { isTelegram, isReady, initData, openExternalLink } =
    useTelegramWebApp();
  const [state, setState] = useState<AuthState>({ status: "booting" });
  const [authAttempt, setAuthAttempt] = useState(0);

  const runAuth = useCallback(async () => {
    if (!isReady) {
      return;
    }
    if (!isTelegram || !initData.trim()) {
      setState({ status: "outside_telegram" });
      return;
    }

    setState({ status: "booting" });

    try {
      const response = await fetch("/api/telegram/mini-app/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData }),
      });

      const body = (await response.json()) as
        | LinkedSession
        | UnlinkedSession
        | { error?: string };

      if (!response.ok) {
        const message =
          "error" in body && typeof body.error === "string"
            ? body.error
            : "Could not verify Telegram identity.";
        setState({
          status: "error",
          message,
        });
        return;
      }

      if ("linked" in body && body.linked) {
        setState({
          status: "linked",
          session: {
            linked: true,
            snappyUserName: body.snappyUserName,
            telegramUsername: body.telegramUsername,
            snappyUrl: body.snappyUrl,
          },
        });
        return;
      }

      if ("linked" in body && !body.linked) {
        setState({
          status: "unlinked",
          session: {
            linked: false,
            connectUrl: body.connectUrl,
            telegramUsername: body.telegramUsername,
          },
        });
      }
    } catch {
      setState({
        status: "error",
        message: "Network error. Try again in a moment.",
      });
    }
  }, [initData, isReady, isTelegram]);

  useEffect(() => {
    queueMicrotask(() => {
      void runAuth();
    });
  }, [runAuth, authAttempt]);

  const retryAuth = useCallback(() => {
    setAuthAttempt((value) => value + 1);
  }, []);

  const value = useMemo(
    () => ({ state, retryAuth, openExternalLink }),
    [state, retryAuth, openExternalLink],
  );

  return (
    <TelegramMiniAppAuthContext.Provider value={value}>
      <AuthGate state={state} openExternalLink={openExternalLink} retryAuth={retryAuth}>
        {children}
      </AuthGate>
    </TelegramMiniAppAuthContext.Provider>
  );
}

function AuthGate({
  state,
  children,
  openExternalLink,
  retryAuth,
}: {
  state: AuthState;
  children: ReactNode;
  openExternalLink: (url: string) => void;
  retryAuth: () => void;
}) {
  if (state.status === "linked") {
    return (
      <Suspense fallback={<MiniAppBootFallback />}>
        <TelegramMiniAppShell>{children}</TelegramMiniAppShell>
      </Suspense>
    );
  }

  return (
    <MiniAppFrame>
      {state.status === "booting" ? (
        <p className="text-sm text-muted-foreground">Connecting…</p>
      ) : null}

      {state.status === "outside_telegram" ? (
        <>
          <p className="text-sm text-muted-foreground">
            Open this page from the Snappy Telegram bot to use the Mini App.
          </p>
          <Link href="/" className="mt-6 text-sm text-primary underline">
            Go to Snappy web
          </Link>
        </>
      ) : null}

      {state.status === "error" ? (
        <>
          <p className="text-sm text-destructive">{state.message}</p>
          <GlowButton
            type="button"
            className="mt-6 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={retryAuth}
          >
            Try Again
          </GlowButton>
        </>
      ) : null}

      {state.status === "unlinked" ? (
        <>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your Telegram account isn&apos;t connected to Snappy yet.
          </p>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Connect your Snappy account to continue.
          </p>
          <div className="mt-10 w-full max-w-xs">
            {state.session.connectUrl ? (
              <GlowButton
                type="button"
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
                onClick={() => openExternalLink(state.session.connectUrl!)}
              >
                Connect Snappy
              </GlowButton>
            ) : (
              <p className="text-sm text-muted-foreground">
                Snappy URL is not configured.
              </p>
            )}
          </div>
        </>
      ) : null}
    </MiniAppFrame>
  );
}

function MiniAppBootFallback() {
  return (
    <div
      className="flex min-h-[var(--tg-viewport-stable-height,100dvh)] items-center justify-center px-4"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

function MiniAppFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-[var(--tg-viewport-stable-height,100dvh)] flex-col px-4"
      style={{
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
      }}
    >
      <header className="text-center">
        <p className="text-3xl" aria-hidden>
          📸
        </p>
        <h1 className="mt-2 font-semibold text-2xl text-foreground tracking-tight">
          Snappy
        </h1>
      </header>
      <main className="mt-10 flex flex-1 flex-col items-center text-center">
        {children}
      </main>
    </div>
  );
}
