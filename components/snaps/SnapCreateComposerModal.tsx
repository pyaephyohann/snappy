"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { GlowButton } from "@/components/ui/glow-button";
import SnapCameraCapture from "@/components/snaps/SnapCameraCapture";
import { isCameraCaptureSupported } from "@/lib/snap-camera";
import { formatFileSize } from "@/lib/format-file-size";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 500;

export interface SnapCreateComposerModalProps {
  onClose: () => void;
  onUpload?: (file: File, caption?: string) => Promise<void>;
  /** When provided, opens directly on preview step with this image. */
  initialFile?: File | null;
  /** Shown when creating a snap for a specific profile. */
  recipientName?: string | null;
  /** When set, shows Retake and returns to camera instead of only file pick. */
  onRetakePhoto?: () => void;
  /** Allow opening in-modal camera (profile Add Snap flow). */
  enableInModalCamera?: boolean;
}

export default function SnapCreateComposerModal({
  onClose,
  onUpload,
  initialFile = null,
  recipientName = null,
  onRetakePhoto,
  enableInModalCamera = true,
}: SnapCreateComposerModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(
    () => initialFile ?? null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    initialFile ? URL.createObjectURL(initialFile) : null,
  );
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success">("idle");
  const [uploadPhase, setUploadPhase] = useState<
    "idle" | "uploading" | "saving"
  >("idle");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const cameraSupported =
    enableInModalCamera && isCameraCaptureSupported();

  const resetPreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
  }, [previewUrl]);

  const applyFile = useCallback(
    (file: File) => {
      setError(null);
      if (!file.type.startsWith("image/")) {
        setError("Please select an image.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError("That image is too large. Please choose an image under 10 MB.");
        return;
      }
      resetPreview();
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    },
    [resetPreview],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleUpload = async () => {
    if (!selectedFile || !onUpload) return;

    setIsUploading(true);
    setError(null);
    setUploadPhase("uploading");

    try {
      await onUpload(selectedFile, caption);
      setUploadPhase("saving");
      setUploadStatus("success");

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
      setIsUploading(false);
      setUploadPhase("idle");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    open: openFileDialog,
  } =
    useDropzone({
      accept: { "image/*": [] },
      maxSize: MAX_FILE_SIZE,
      multiple: false,
      onDrop: (acceptedFiles) => {
        if (acceptedFiles.length > 0) {
          applyFile(acceptedFiles[0]);
        }
      },
      onDropRejected: (fileRejections) => {
        if (fileRejections.length > 0) {
          const rejection = fileRejections[0];
          if (rejection.errors.some((e) => e.code === "file-too-large")) {
            setError(
              "That image is too large. Please choose an image under 10 MB.",
            );
          } else {
            setError("Please select a valid image file.");
          }
        }
      },
    });

  const title = recipientName ? `Add Snap for ${recipientName}` : "Add Snap";

  return (
    <>
      <div
        className="safe-area-pt safe-area-pb fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="snap-composer-title"
        onKeyDown={handleKeyDown}
      >
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="relative max-h-[92vh] w-full max-w-lg overflow-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-border p-4 sm:p-6">
            <h2
              id="snap-composer-title"
              className="text-lg font-semibold text-foreground sm:text-xl"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Close"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="p-4 sm:p-6">
            <input {...getInputProps()} />

            {error ? (
              <div
                className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            {previewUrl ? (
              <div className="mb-6">
                <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted sm:aspect-video">
                  <img
                    src={previewUrl}
                    alt="Selected image preview"
                    className="h-full w-full object-contain"
                  />
                </div>
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  {selectedFile ? formatFileSize(selectedFile.size) : null}
                </p>
              </div>
            ) : (
              <div className="mb-6 space-y-4">
                <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:items-stretch">
                  {cameraSupported ? (
                    <GlowButton
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      disabled={isUploading}
                      glowClassName="w-full max-w-xs sm:max-w-none sm:flex-1"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground transition-opacity hover:opacity-90 sm:flex-1 sm:text-base"
                    >
                      Take Photo
                    </GlowButton>
                  ) : null}
                  <GlowButton
                    type="button"
                    onClick={openFileDialog}
                    disabled={isUploading}
                    glowClassName="w-full max-w-xs sm:max-w-none sm:flex-1"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3 text-sm text-secondary-foreground transition-colors hover:bg-secondary/80 sm:flex-1 sm:text-base"
                  >
                    Choose Photo
                  </GlowButton>
                </div>

                <div
                  {...getRootProps()}
                  className={`flex aspect-square w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted transition-colors sm:aspect-video ${
                    isDragActive
                      ? "border-primary bg-primary/5"
                      : isDragReject
                        ? "border-destructive bg-destructive/5"
                        : ""
                  }`}
                >
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {isDragActive
                      ? "Drop image here"
                      : "Or drag and drop an image to preview"}
                  </p>
                </div>
              </div>
            )}

            {previewUrl ? (
              <div className="mb-6">
                <label
                  htmlFor="snap-composer-caption"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Caption
                </label>
                <textarea
                  id="snap-composer-caption"
                  value={caption}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_CAPTION_LENGTH) {
                      setCaption(e.target.value);
                    }
                  }}
                  placeholder="Write a caption..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  maxLength={MAX_CAPTION_LENGTH}
                  disabled={isUploading || uploadStatus === "success"}
                />
                <div className="mt-1 text-right text-xs text-muted-foreground">
                  {caption.length}/{MAX_CAPTION_LENGTH}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              {previewUrl && onRetakePhoto ? (
                <GlowButton
                  type="button"
                  onClick={onRetakePhoto}
                  disabled={isUploading || uploadStatus === "success"}
                  glowClassName="flex-1"
                  className="w-full flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                >
                  Retake Photo
                </GlowButton>
              ) : (
                <GlowButton
                  type="button"
                  onClick={openFileDialog}
                  disabled={isUploading || uploadStatus === "success"}
                  glowClassName="flex-1"
                  className="w-full flex-1 rounded-lg bg-secondary px-4 py-3 text-sm text-secondary-foreground transition-colors hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                >
                  {previewUrl ? "Change Image" : "Select Image"}
                </GlowButton>
              )}

              <GlowButton
                type="button"
                onClick={onClose}
                disabled={isUploading || uploadStatus === "success"}
                glowClassName="flex-1"
                className="w-full flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
              >
                Cancel
              </GlowButton>

              {onUpload ? (
                <GlowButton
                  type="button"
                  onClick={() => void handleUpload()}
                  disabled={
                    !selectedFile || isUploading || uploadStatus === "success"
                  }
                  glowClassName="flex-1"
                  className="w-full flex-1 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                >
                  {uploadPhase === "uploading"
                    ? "Uploading image..."
                    : uploadPhase === "saving"
                      ? "Saving snap..."
                      : uploadStatus === "success"
                        ? "Uploaded ✓"
                        : "Upload"}
                </GlowButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {isCameraOpen ? (
        <SnapCameraCapture
          onCapture={(file) => {
            setIsCameraOpen(false);
            applyFile(file);
          }}
          onClose={() => setIsCameraOpen(false)}
          onChooseGallery={() => {
            setIsCameraOpen(false);
            openFileDialog();
          }}
        />
      ) : null}
    </>
  );
}
