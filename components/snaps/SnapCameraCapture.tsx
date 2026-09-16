"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { GlowButton } from "@/components/ui/glow-button";
import {
  captureVideoFrameToFile,
  getCameraErrorMessage,
  isCameraCaptureSupported,
  stopMediaStream,
  type CameraFacingMode,
} from "@/lib/snap-camera";

type CameraPhase =
  | "initializing"
  | "live"
  | "review"
  | "permission-denied"
  | "unsupported"
  | "error";

interface SnapCameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
  onChooseGallery: () => void;
}

export default function SnapCameraCapture({
  onCapture,
  onClose,
  onChooseGallery,
}: SnapCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const reviewUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<CameraPhase>(() =>
    isCameraCaptureSupported() ? "initializing" : "unsupported",
  );
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("environment");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [canSwitchCamera, setCanSwitchCamera] = useState(true);

  const clearReview = useCallback(() => {
    if (reviewUrlRef.current) {
      URL.revokeObjectURL(reviewUrlRef.current);
      reviewUrlRef.current = null;
    }
    setReviewUrl(null);
    setCapturedFile(null);
  }, []);

  const attachStream = useCallback(async (mode: CameraFacingMode) => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: mode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    streamRef.current = stream;

    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play();
    }

    setPhase("live");
    setErrorMessage(null);
  }, []);

  const startCamera = useCallback(
    async (mode: CameraFacingMode) => {
      if (!isCameraCaptureSupported()) {
        setPhase("unsupported");
        return;
      }

      setPhase("initializing");
      setErrorMessage(null);
      clearReview();

      try {
        await attachStream(mode);
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setPhase("permission-denied");
        } else {
          setPhase("error");
        }
        setErrorMessage(getCameraErrorMessage(error));
        console.error("Camera initialization failed:", error);
      }
    },
    [attachStream, clearReview],
  );

  useEffect(() => {
    let cancelled = false;

    async function initializeCamera() {
      if (!isCameraCaptureSupported()) {
        if (!cancelled) setPhase("unsupported");
        return;
      }

      if (!cancelled) {
        setPhase("initializing");
        setErrorMessage(null);
        clearReview();
      }

      try {
        if (cancelled) return;
        await attachStream(facingMode);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setPhase("permission-denied");
        } else {
          setPhase("error");
        }
        setErrorMessage(getCameraErrorMessage(error));
        console.error("Camera initialization failed:", error);
      }
    }

    void initializeCamera();

    return () => {
      cancelled = true;
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      if (reviewUrlRef.current) {
        URL.revokeObjectURL(reviewUrlRef.current);
        reviewUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount lifecycle only
  }, []);

  const handleSwitchCamera = async () => {
    if (phase !== "live" || isCapturing || !canSwitchCamera) return;

    const nextMode: CameraFacingMode =
      facingMode === "environment" ? "user" : "environment";

    setPhase("initializing");
    try {
      await attachStream(nextMode);
      setFacingMode(nextMode);
    } catch (error) {
      setCanSwitchCamera(false);
      await attachStream(facingMode).catch(() => undefined);
      setPhase("live");
      setErrorMessage(getCameraErrorMessage(error));
      console.error("Camera switch failed:", error);
    }
  };

  const handleCapture = async () => {
    if (phase !== "live" || !videoRef.current || isCapturing) return;

    setIsCapturing(true);
    setErrorMessage(null);

    try {
      const file = await captureVideoFrameToFile(
        videoRef.current,
        facingMode,
      );

      stopMediaStream(streamRef.current);
      streamRef.current = null;

      clearReview();
      const url = URL.createObjectURL(file);
      reviewUrlRef.current = url;
      setReviewUrl(url);
      setCapturedFile(file);
      setPhase("review");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "We couldn't capture the photo. Please try again.",
      );
      console.error("Camera capture failed:", error);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRetake = () => {
    clearReview();
    void startCamera(facingMode);
  };

  const handleUsePhoto = () => {
    if (!capturedFile) return;
    onCapture(capturedFile);
  };

  const showLivePreview = phase === "live" || phase === "initializing";

  return (
    <div
      className="safe-area-pt safe-area-pb fixed inset-0 z-[60] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Camera capture"
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {showLivePreview && (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`absolute inset-0 h-full w-full object-cover ${
                facingMode === "user" ? "-scale-x-100" : ""
              }`}
            />
            {phase === "initializing" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <p className="text-sm text-white/90">Starting camera…</p>
              </div>
            )}
          </>
        )}

        {phase === "review" && reviewUrl && (
          <img
            src={reviewUrl}
            alt="Captured photo preview"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {(phase === "permission-denied" ||
          phase === "unsupported" ||
          phase === "error") && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="max-w-sm text-base text-white/90">
              {phase === "unsupported"
                ? "Camera capture isn't supported in this browser. You can still choose a photo from your device."
                : errorMessage}
            </p>
            <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
              <GlowButton
                type="button"
                onClick={onChooseGallery}
                className="w-full rounded-xl bg-primary px-4 py-3 text-primary-foreground"
              >
                Choose Photo
              </GlowButton>
              <GlowButton
                type="button"
                onClick={onClose}
                className="w-full rounded-xl border border-white/20 bg-transparent px-4 py-3 text-white"
              >
                Close
              </GlowButton>
            </div>
          </div>
        )}

        {errorMessage &&
          (phase === "live" || phase === "initializing" || phase === "review") && (
            <div
              className="safe-area-pt absolute left-4 right-4 top-16 z-20 rounded-xl bg-destructive/90 px-4 py-3 text-sm text-white"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

        {(phase === "live" || phase === "review") && (
          <>
            <div className="safe-area-pt safe-area-pl safe-area-pr relative z-10 flex items-center justify-between p-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/20 bg-black/40 p-3 text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/60"
                aria-label="Close camera"
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

              {phase === "live" && canSwitchCamera && (
                <button
                  type="button"
                  onClick={() => void handleSwitchCamera()}
                  disabled={isCapturing}
                  className="rounded-full border border-white/20 bg-black/40 p-3 text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/60 disabled:opacity-50"
                  aria-label="Switch camera"
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              )}
            </div>

            <div className="safe-area-pb safe-area-pl safe-area-pr relative z-10 mt-auto flex flex-col items-center gap-4 p-6 pb-8">
              {phase === "live" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleCapture()}
                    disabled={isCapturing || phase !== "live"}
                    className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/60 disabled:opacity-50"
                    aria-label="Take photo"
                  >
                    <span className="block h-12 w-12 rounded-full bg-white" />
                  </button>
                  <GlowButton
                    type="button"
                    onClick={onChooseGallery}
                    className="rounded-xl border border-white/25 bg-black/40 px-4 py-2 text-sm text-white backdrop-blur-sm"
                  >
                    Gallery
                  </GlowButton>
                </>
              ) : (
                <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
                  <GlowButton
                    type="button"
                    onClick={handleRetake}
                    className="flex-1 rounded-xl border border-white/25 bg-black/40 px-4 py-3 text-white backdrop-blur-sm"
                  >
                    Retake
                  </GlowButton>
                  <GlowButton
                    type="button"
                    onClick={handleUsePhoto}
                    className="flex-1 rounded-xl bg-primary px-4 py-3 text-primary-foreground"
                  >
                    Use Photo
                  </GlowButton>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
