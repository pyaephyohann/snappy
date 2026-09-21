/**
 * Client-side snap upload flow (Cloudinary sign → upload → POST /api/snaps).
 * Shared by profile uploader, mobile bottom-nav camera, and Telegram Mini App.
 */
import { SNAP_ALLOWED_IMAGE_MIME_TYPES } from "@/lib/snap-media";

export const SNAP_UPLOAD_ACCEPT = SNAP_ALLOWED_IMAGE_MIME_TYPES.join(",");

export type UploadedCloudinaryImage = {
  imageUrl: string;
  publicId: string;
};

export type CreatedSnapPayload = {
  id: string;
  imageUrl: string;
  caption: string | null;
};

export class SnapUploadClientError extends Error {
  readonly code:
    | "sign_failed"
    | "cloudinary_failed"
    | "snap_create_failed"
    | "session_expired"
    | "unknown";

  constructor(
    code: SnapUploadClientError["code"],
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "SnapUploadClientError";
  }
}

export async function uploadImageFileToCloudinary(
  file: File,
): Promise<UploadedCloudinaryImage> {
  const optimizationForm = new FormData();
  optimizationForm.append("file", file);
  const optimizationResponse = await fetch("/api/cloudinary/optimize", {
    method: "POST",
    body: optimizationForm,
    credentials: "include",
  });

  if (optimizationResponse.status === 401) {
    throw new SnapUploadClientError(
      "session_expired",
      "Your Snappy session has expired.",
    );
  }

  if (!optimizationResponse.ok) {
    const result = (await optimizationResponse.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new SnapUploadClientError(
      "sign_failed",
      result?.error ?? "Unable to optimize image. Please try again.",
    );
  }

  const optimizedBlob = await optimizationResponse.blob();
  const optimizedFile = new File(
    [optimizedBlob],
    `${file.name.replace(/\.[^.]+$/, "") || "snappy-image"}.webp`,
    { type: "image/webp" },
  );

  const timestamp = Math.floor(Date.now() / 1000);
  const signatureResponse = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ timestamp }),
  });

  if (signatureResponse.status === 401) {
    throw new SnapUploadClientError(
      "session_expired",
      "Your Snappy session has expired.",
    );
  }

  if (!signatureResponse.ok) {
    throw new SnapUploadClientError(
      "sign_failed",
      "Unable to start upload. Please try again.",
    );
  }

  const signatureData = await signatureResponse.json();

  const formData = new FormData();
  formData.append("file", optimizedFile);
  formData.append("api_key", signatureData.api_key);
  formData.append("timestamp", signatureData.timestamp.toString());
  formData.append("signature", signatureData.signature);
  formData.append("folder", signatureData.folder);

  const cloudName = signatureData.cloud_name as string;
  const uploadUrl =
    "https://api.cloudinary.com/v1_1/" + cloudName + "/image/upload";

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new SnapUploadClientError(
      "cloudinary_failed",
      "Upload failed. Please try again.",
    );
  }

  const uploadData = await uploadResponse.json();

  return {
    imageUrl: uploadData.secure_url as string,
    publicId: uploadData.public_id as string,
  };
}

async function createSnapOnServer(input: {
  endpoint: string;
  body: Record<string, unknown>;
}): Promise<CreatedSnapPayload> {
  const snapResponse = await fetch(input.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input.body),
  });

  if (snapResponse.status === 401) {
    throw new SnapUploadClientError(
      "session_expired",
      "Your Snappy session has expired.",
    );
  }

  if (!snapResponse.ok) {
    throw new SnapUploadClientError(
      "snap_create_failed",
      "Your image uploaded, but the Snap could not be created. Please try again.",
    );
  }

  const data = (await snapResponse.json()) as {
    snap: {
      id: string;
      imageUrl: string;
      caption: string | null;
    };
  };

  return {
    id: data.snap.id,
    imageUrl: data.snap.imageUrl,
    caption: data.snap.caption,
  };
}

/** Generate a stable UUID v4 for idempotency. */
function generateIdempotencyKey(): string {
  // Use crypto.randomUUID() if available (modern browsers + Node 19+).
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: crypto.getRandomValues (available in all modern browsers).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function uploadSnapForUser(
  targetUserId: string,
  file: File,
  caption?: string,
  idempotencyKey?: string,
): Promise<void> {
  // Generate once per logical operation. Callers can pass the same key when
  // retrying the operation after a lost response.
  const stableIdempotencyKey = idempotencyKey ?? generateIdempotencyKey();

  const uploaded = await uploadImageFileToCloudinary(file);
  await createSnapOnServer({
    endpoint: "/api/snaps",
    body: {
      targetUserId,
      imageUrl: uploaded.imageUrl,
      publicId: uploaded.publicId,
      caption: caption || undefined,
      idempotencyKey: stableIdempotencyKey,
    },
  });
}

/** Mini App upload — Snap owner is resolved on the server from the session. */
export async function uploadSnapForMiniApp(
  file: File,
  caption?: string,
  idempotencyKey?: string,
): Promise<CreatedSnapPayload> {
  // Generate a stable idempotency key ONCE per logical upload.
  const stableIdempotencyKey = idempotencyKey ?? generateIdempotencyKey();

  const uploaded = await uploadImageFileToCloudinary(file);
  return createSnapOnServer({
    endpoint: "/api/telegram/mini-app/snaps",
    body: {
      imageUrl: uploaded.imageUrl,
      publicId: uploaded.publicId,
      caption: caption || undefined,
      idempotencyKey: stableIdempotencyKey,
    },
  });
}
