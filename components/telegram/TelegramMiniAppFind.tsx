"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import SnapViewer from "@/components/snaps/SnapViewer";
import { GlowButton } from "@/components/ui/glow-button";
import { useTelegramBackButton } from "@/hooks/useTelegramBackButton";
import { normalizeSnapLookupCode } from "@/lib/snap-code";
import type { MiniAppFindSnapPayload } from "@/lib/telegram/mini-app-find";
import { TELEGRAM_MINI_APP_ROUTES } from "@/lib/telegram/mini-app-routes";

type FindPhase =
  | { kind: "form" }
  | { kind: "loading" }
  | { kind: "result"; snap: MiniAppFindSnapPayload }
  | { kind: "invalid_code" }
  | { kind: "not_found" }
  | { kind: "error" };

export default function TelegramMiniAppFind() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [codeInput, setCodeInput] = useState("");
  const [phase, setPhase] = useState<FindPhase>({ kind: "form" });
  const [viewerOpen, setViewerOpen] = useState(false);
  const fetchGeneration = useRef(0);
  const urlCodeHandled = useRef(false);

  const hasResult = phase.kind === "result";
  const isBusy = phase.kind === "loading";

  const handleBack = useCallback(() => {
    if (viewerOpen) {
      setViewerOpen(false);
      return;
    }
    if (hasResult || phase.kind === "not_found" || phase.kind === "invalid_code") {
      setPhase({ kind: "form" });
      setCodeInput("");
      router.replace(TELEGRAM_MINI_APP_ROUTES.find);
      queueMicrotask(() => inputRef.current?.focus());
      return;
    }
    router.push(TELEGRAM_MINI_APP_ROUTES.home);
  }, [hasResult, phase.kind, router, viewerOpen]);

  useTelegramBackButton({ enabled: true, onBack: handleBack });

  const runLookup = useCallback(
    async (rawCode: string) => {
      const normalized = normalizeSnapLookupCode(rawCode);
      if (!normalized.ok) {
        setPhase({ kind: "invalid_code" });
        return;
      }

      const generation = ++fetchGeneration.current;
      setPhase({ kind: "loading" });

      try {
        const params = new URLSearchParams({ code: normalized.code });
        const response = await fetch(
          `/api/telegram/mini-app/find?${params.toString()}`,
          { credentials: "include" },
        );

        if (generation !== fetchGeneration.current) {
          return;
        }

        if (response.status === 401) {
          setPhase({ kind: "error" });
          return;
        }

        if (!response.ok) {
          setPhase({ kind: "error" });
          return;
        }

        const body = (await response.json()) as {
          found: boolean;
          invalidCode?: boolean;
          snap?: MiniAppFindSnapPayload;
        };

        if (body.invalidCode) {
          setPhase({ kind: "invalid_code" });
          return;
        }

        if (!body.found || !body.snap) {
          setPhase({ kind: "not_found" });
          router.replace(
            `${TELEGRAM_MINI_APP_ROUTES.find}?code=${encodeURIComponent(normalized.code)}`,
          );
          return;
        }

        setPhase({ kind: "result", snap: body.snap });
        router.replace(
          `${TELEGRAM_MINI_APP_ROUTES.find}?code=${encodeURIComponent(normalized.code)}`,
        );
      } catch {
        if (generation === fetchGeneration.current) {
          setPhase({ kind: "error" });
        }
      }
    },
    [router],
  );

  useEffect(() => {
    if (urlCodeHandled.current) {
      return;
    }
    const paramCode = searchParams.get("code")?.trim() ?? "";
    if (!paramCode) {
      return;
    }
    const normalized = normalizeSnapLookupCode(paramCode);
    if (!normalized.ok) {
      return;
    }
    urlCodeHandled.current = true;
    queueMicrotask(() => {
      setCodeInput(normalized.code);
      void runLookup(normalized.code);
    });
  }, [searchParams, runLookup]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isBusy) {
      return;
    }
    void runLookup(codeInput);
  };

  const onFindAnother = () => {
    fetchGeneration.current += 1;
    urlCodeHandled.current = false;
    setViewerOpen(false);
    setPhase({ kind: "form" });
    setCodeInput("");
    router.replace(TELEGRAM_MINI_APP_ROUTES.find);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const showForm =
    phase.kind === "form" ||
    phase.kind === "loading" ||
    phase.kind === "invalid_code" ||
    phase.kind === "not_found" ||
    phase.kind === "error";

  return (
    <div className="px-4 pb-6">
      <header className="mb-6 text-center">
        <p className="text-3xl" aria-hidden>
          🔍
        </p>
        <h1 className="mt-2 text-xl font-semibold text-foreground">
          Find a Snap
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the Snap code below.
        </p>
      </header>

      {showForm ? (
        <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4">
          <label className="block text-left text-sm font-medium text-foreground">
            Snap code
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={codeInput}
              disabled={isBusy}
              onChange={(event) => setCodeInput(event.target.value)}
              placeholder="Paste Snap code"
              className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none ring-primary focus:border-primary focus:ring-2 disabled:opacity-60"
            />
          </label>

          {phase.kind === "invalid_code" ? (
            <p className="text-sm text-destructive">
              Please enter a valid Snap code.
            </p>
          ) : null}

          {phase.kind === "not_found" ? (
            <p className="text-sm text-muted-foreground">
              Snap not found. Check the code and try again.
            </p>
          ) : null}

          {phase.kind === "error" ? (
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-sm text-foreground">Something went wrong.</p>
              <GlowButton
                type="button"
                className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
                onClick={() => void runLookup(codeInput)}
              >
                Try Again
              </GlowButton>
            </div>
          ) : null}

          {phase.kind === "loading" ? (
            <p className="text-center text-sm text-muted-foreground">
              🔍 Finding Snap…
            </p>
          ) : null}

          <GlowButton
            type="submit"
            disabled={isBusy || !codeInput.trim()}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isBusy ? "Finding…" : "Find Snap"}
          </GlowButton>
        </form>
      ) : null}

      {phase.kind === "result" ? (
        <div className="mx-auto max-w-md">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="relative aspect-[3/4] w-full bg-muted">
              <Image
                src={phase.snap.imageUrl}
                alt={phase.snap.caption ?? `${phase.snap.username}'s snap`}
                fill
                className="object-cover"
                sizes="(max-width: 448px) 100vw, 448px"
              />
            </div>
            <div className="space-y-4 p-4">
              <p className="font-medium text-foreground">
                @{phase.snap.username}
              </p>
              {phase.snap.caption ? (
                <p className="text-sm text-muted-foreground">
                  {phase.snap.caption}
                </p>
              ) : null}
              <GlowButton
                type="button"
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
                onClick={() => setViewerOpen(true)}
              >
                View Snap
              </GlowButton>
              <GlowButton
                type="button"
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"
                onClick={onFindAnother}
              >
                Find Another
              </GlowButton>
            </div>
          </div>

          <SnapViewer
            isOpen={viewerOpen}
            onClose={() => setViewerOpen(false)}
            imageUrl={phase.snap.imageUrl}
            caption={phase.snap.caption}
            friendName={phase.snap.username}
            snapId={phase.snap.id}
          />
        </div>
      ) : null}
    </div>
  );
}
