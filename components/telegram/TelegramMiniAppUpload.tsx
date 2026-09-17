"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import SnapViewer from "@/components/snaps/SnapViewer";
import { useTelegramMiniAppAuth } from "@/components/telegram/TelegramMiniAppAuthProvider";
import TelegramMiniAppReconnect from "@/components/telegram/TelegramMiniAppReconnect";
import { GlowButton } from "@/components/ui/glow-button";
import { useTelegramBackButton } from "@/hooks/useTelegramBackButton";
import {
  SNAP_MAX_IMAGE_BYTES,
  validateSnapImageFileMeta,
} from "@/lib/snap-media";
import {
  SNAP_UPLOAD_ACCEPT,
  SnapUploadClientError,
  uploadSnapForMiniApp,
  type CreatedSnapPayload,
} from "@/lib/snap-upload-client";
import { TELEGRAM_MINI_APP_ROUTES } from "@/lib/telegram/mini-app-routes";
import { formatFileSize } from "@/lib/format-file-size";

type UploadPhase =
  | { kind: "pick" }
  | { kind: "preview"; file: File; previewUrl: string }
  | { kind: "uploading" }
  | { kind: "success"; snap: CreatedSnapPayload }
  | { kind: "invalid_file" }
  | { kind: "upload_error"; message: string; canRetry: boolean }
  | { kind: "session_expired" };


export default function TelegramMiniAppUpload() {
  const router = useRouter();
  const { retryAuth } = useTelegramMiniAppAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadGeneration = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const [phase, setPhase] = useState<UploadPhase>({ kind: "pick" });

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const resetToPick = useCallback(() => {
    uploadGeneration.current += 1;
    revokePreview();
    setViewerOpen(false);
    setPhase({ kind: "pick" });
    selectedFileRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [revokePreview]);

  const handleBack = useCallback(() => {
    if (phase.kind === "uploading") {
      return;
    }
    if (viewerOpen) {
      setViewerOpen(false);
      return;
    }
    if (phase.kind === "preview") {
      resetToPick();
      return;
    }
    if (phase.kind === "success") {
      resetToPick();
      return;
    }
    router.push(TELEGRAM_MINI_APP_ROUTES.home);
  }, [phase.kind, resetToPick, router, viewerOpen]);

  useTelegramBackButton({
    enabled: phase.kind !== "uploading",
    onBack: handleBack,
  });

  useEffect(() => {
    return () => {
      revokePreview();
    };
  }, [revokePreview]);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const validated = validateSnapImageFileMeta(file);
    if (!validated.ok) {
      setPhase({ kind: "invalid_file" });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    revokePreview();
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;
    selectedFileRef.current = file;
    setPhase({ kind: "preview", file, previewUrl });
  };

  const onUpload = async () => {
    if (phase.kind !== "preview") {
      return;
    }

    const generation = ++uploadGeneration.current;
    setPhase({ kind: "uploading" });

    try {
      const snap = await uploadSnapForMiniApp(phase.file);
      if (generation !== uploadGeneration.current) {
        return;
      }
      revokePreview();
      setPhase({ kind: "success", snap });
    } catch (error) {
      if (generation !== uploadGeneration.current) {
        return;
      }
      if (error instanceof SnapUploadClientError) {
        if (error.code === "session_expired") {
          setPhase({ kind: "session_expired" });
          return;
        }
        if (error.code === "snap_create_failed") {
          setPhase({
            kind: "upload_error",
            message: error.message,
            canRetry: true,
          });
          return;
        }
        setPhase({
          kind: "upload_error",
          message: error.message,
          canRetry: true,
        });
        return;
      }
      setPhase({
        kind: "upload_error",
        message: "Upload failed.",
        canRetry: true,
      });
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="px-4 pb-6">
      <input
        ref={fileInputRef}
        type="file"
        accept={SNAP_UPLOAD_ACCEPT}
        capture="environment"
        className="sr-only"
        onChange={onFileChange}
      />

      {phase.kind === "pick" || phase.kind === "invalid_file" ? (
        <div className="mx-auto flex max-w-md flex-col items-center pt-6 text-center">
          <p className="text-4xl" aria-hidden>
            📤
          </p>
          <h1 className="mt-4 text-xl font-semibold text-foreground">Upload</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Share a Snap with your friends
          </p>
          {phase.kind === "invalid_file" ? (
            <p className="mt-4 text-sm text-destructive">
              Please choose a supported image under 10 MB.
            </p>
          ) : null}
          <GlowButton
            type="button"
            className="mt-10 w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            onClick={openFilePicker}
          >
            Choose Photo
          </GlowButton>
          <p className="mt-6 text-xs text-muted-foreground">
            JPG · PNG · WEBP · GIF · Max {formatFileSize(SNAP_MAX_IMAGE_BYTES)}
          </p>
        </div>
      ) : null}

      {phase.kind === "preview" ? (
        <div className="mx-auto max-w-md pt-4">
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={phase.previewUrl}
              alt="Selected snap preview"
              className="h-full w-full object-cover"
            />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            {formatFileSize(phase.file.size)}
          </p>
          <div className="mt-6 space-y-3">
            <GlowButton
              type="button"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"
              onClick={openFilePicker}
            >
              Change Photo
            </GlowButton>
            <GlowButton
              type="button"
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
              onClick={() => void onUpload()}
            >
              Upload Snap
            </GlowButton>
          </div>
        </div>
      ) : null}

      {phase.kind === "uploading" ? (
        <div className="mx-auto flex max-w-md flex-col items-center pt-16 text-center">
          <p className="text-sm font-medium text-foreground">Uploading Snap…</p>
          <div className="mt-6 h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Please keep this screen open.
          </p>
        </div>
      ) : null}

      {phase.kind === "upload_error" ? (
        <div className="mx-auto max-w-md pt-10 text-center">
          <p className="text-sm text-foreground">{phase.message}</p>
          {phase.canRetry ? (
            <GlowButton
              type="button"
              className="mt-6 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
              onClick={() => {
                const file = selectedFileRef.current;
                const previewUrl = previewUrlRef.current;
                if (file && previewUrl) {
                  setPhase({ kind: "preview", file, previewUrl });
                  return;
                }
                resetToPick();
              }}
            >
              Try Again
            </GlowButton>
          ) : null}
        </div>
      ) : null}

      {phase.kind === "session_expired" ? (
        <div className="mx-auto max-w-md pt-10">
          <TelegramMiniAppReconnect onReconnect={() => retryAuth()} />
        </div>
      ) : null}

      {phase.kind === "success" ? (
        <div className="mx-auto max-w-md pt-6 text-center">
          <p className="text-4xl" aria-hidden>
            ✓
          </p>
          <h2 className="mt-3 text-xl font-semibold text-foreground">
            Snap Ready
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your Snap has been uploaded successfully
          </p>
          <div className="mt-8 rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Snap code</p>
            <p className="mt-1 break-all font-mono text-sm text-foreground">
              {phase.snap.id}
            </p>
          </div>
          <div className="relative mx-auto mt-6 aspect-[3/4] max-h-48 w-32 overflow-hidden rounded-xl border border-border">
            <Image
              src={phase.snap.imageUrl}
              alt="Uploaded snap"
              fill
              className="object-cover"
              sizes="128px"
            />
          </div>
          <div className="mt-8 space-y-3">
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
              onClick={resetToPick}
            >
              Upload Another
            </GlowButton>
          </div>
          <SnapViewer
            isOpen={viewerOpen}
            onClose={() => setViewerOpen(false)}
            imageUrl={phase.snap.imageUrl}
            caption={phase.snap.caption}
            friendName="You"
            snapId={phase.snap.id}
          />
        </div>
      ) : null}
    </div>
  );
}
