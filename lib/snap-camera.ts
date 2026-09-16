export type CameraFacingMode = "user" | "environment";

export function isCameraCaptureSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.isSecureContext &&
      navigator.mediaDevices?.getUserMedia,
  );
}

export function getCameraErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return "We couldn't start the camera. You can still choose a photo from your device.";
  }

  switch (error.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera access isn't available. You can still choose a photo from your device.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found on this device. You can choose a photo from your gallery instead.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is in use by another app. Close it and try again, or choose a photo from your device.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "This camera mode isn't supported on your device. Try switching cameras or choose a photo from your device.";
    default:
      return "We couldn't start the camera. You can still choose a photo from your device.";
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

export async function captureVideoFrameToFile(
  video: HTMLVideoElement,
  facingMode: CameraFacingMode,
): Promise<File> {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    throw new Error("Camera preview isn't ready yet. Please try again.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("We couldn't capture the photo. Please try again.");
  }

  if (facingMode === "user") {
    context.translate(width, 0);
    context.scale(-1, 1);
  }

  context.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("We couldn't capture the photo. Please try again."));
          return;
        }
        resolve(result);
      },
      "image/jpeg",
      0.92,
    );
  });

  return new File([blob], `snap-camera-${Date.now()}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
