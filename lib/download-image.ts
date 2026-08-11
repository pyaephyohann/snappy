const ALLOWED_HOSTS = [
  "res.cloudinary.com",
  "picsum.photos",
  "api.dicebear.com",
  "i.pinimg.com",
];

function getExtensionFromUrl(imageUrl: string): string | null {
  try {
    const pathname = new URL(imageUrl).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function getExtensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  return map[mime] || "jpg";
}

export function buildSnapFilename(
  friendName: string,
  snapIndex: number,
  imageUrl: string,
): string {
  const slug = friendName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const ext = getExtensionFromUrl(imageUrl) || "jpg";
  return `${slug || "snap"}-snap-${snapIndex + 1}.${ext}`;
}

function isAllowedImageUrl(imageUrl: string): boolean {
  try {
    const { hostname } = new URL(imageUrl);
    return ALLOWED_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function downloadImage(
  imageUrl: string,
  filename: string,
): Promise<void> {
  if (!isAllowedImageUrl(imageUrl)) {
    throw new Error("This image cannot be downloaded.");
  }

  // Try direct fetch first (works when CORS allows it)
  try {
    const directResponse = await fetch(imageUrl, { mode: "cors" });
    if (directResponse.ok) {
      const blob = await directResponse.blob();
      const ext = getExtensionFromUrl(imageUrl);
      const finalName =
        ext && filename.endsWith(`.${ext}`)
          ? filename
          : filename.replace(/\.[^.]+$/, `.${getExtensionFromMime(blob.type)}`);
      triggerBlobDownload(blob, finalName);
      return;
    }
  } catch {
    // Fall through to proxy
  }

  // Server proxy fallback for cross-origin restrictions
  const proxyUrl = `/api/download-image?url=${encodeURIComponent(imageUrl)}`;
  const proxyResponse = await fetch(proxyUrl);

  if (!proxyResponse.ok) {
    throw new Error("Unable to download this image. Please try again.");
  }

  const blob = await proxyResponse.blob();
  triggerBlobDownload(blob, filename);
}
