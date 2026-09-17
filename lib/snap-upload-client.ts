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
  formData.append("file", file);
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

export async function uploadSnapForUser(
  targetUserId: string,
  file: File,
  caption?: string,
): Promise<void> {
  const uploaded = await uploadImageFileToCloudinary(file);
  await createSnapOnServer({
    endpoint: "/api/snaps",
    body: {
      targetUserId,
      imageUrl: uploaded.imageUrl,
      publicId: uploaded.publicId,
      caption: caption || undefined,
    },
  });
}

/** Mini App upload — Snap owner is resolved on the server from the session. */
export async function uploadSnapForMiniApp(
  file: File,
  caption?: string,
): Promise<CreatedSnapPayload> {
  const uploaded = await uploadImageFileToCloudinary(file);
  return createSnapOnServer({
    endpoint: "/api/telegram/mini-app/snaps",
    body: {
      imageUrl: uploaded.imageUrl,
      publicId: uploaded.publicId,
      caption: caption || undefined,
    },
  });
}
