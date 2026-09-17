/** Shared with web uploader (SnapCreateComposerModal). */
export const SNAP_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const SNAP_MAX_CAPTION_LENGTH = 500;

export const SNAP_ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const ALLOWED_IMAGE_MIME_TYPES = new Set<string>(SNAP_ALLOWED_IMAGE_MIME_TYPES);

export type SnapImageValidationResult =
  | { ok: true; mimeType: string }
  | { ok: false; reason: "empty" | "too_large" | "unsupported_type" | "invalid_image" };

/** Client-side preflight (size + declared MIME). Server still validates media on create. */
export function validateSnapImageFileMeta(
  file: Pick<File, "size" | "type">,
): SnapImageValidationResult {
  if (!file.size) {
    return { ok: false, reason: "empty" };
  }
  if (file.size > SNAP_MAX_IMAGE_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  const mime = file.type.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!mime || !ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
    return { ok: false, reason: "unsupported_type" };
  }
  return { ok: true, mimeType: mime };
}

export function validateSnapImageBuffer(
  buffer: Buffer,
  declaredMimeType?: string | null,
): SnapImageValidationResult {
  if (!buffer.length) {
    return { ok: false, reason: "empty" };
  }
  if (buffer.length > SNAP_MAX_IMAGE_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  const detected = detectImageMimeType(buffer);
  if (!detected) {
    return { ok: false, reason: "invalid_image" };
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.has(detected)) {
    return { ok: false, reason: "unsupported_type" };
  }
  if (declaredMimeType) {
    const normalizedDeclared = declaredMimeType.toLowerCase().split(";")[0]?.trim();
    if (
      normalizedDeclared?.startsWith("image/") &&
      ALLOWED_IMAGE_MIME_TYPES.has(normalizedDeclared) &&
      normalizedDeclared !== detected
    ) {
      return { ok: false, reason: "invalid_image" };
    }
  }

  return { ok: true, mimeType: detected };
}

function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46
  ) {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
