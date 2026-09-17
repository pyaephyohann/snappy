export const CLOUDINARY_DOMAIN = "res.cloudinary.com";
export const CLOUDINARY_SNAP_FOLDER = "snappy/snaps/";
export const CLOUDINARY_SNAP_FOLDER_RAW = "snappy/snaps";

export function validateCloudinarySnapUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "https:" && urlObj.hostname === CLOUDINARY_DOMAIN;
  } catch {
    return false;
  }
}

export function validateCloudinarySnapPublicId(publicId: string): boolean {
  if (!publicId || publicId.trim().length === 0) {
    return false;
  }
  return publicId.startsWith(CLOUDINARY_SNAP_FOLDER);
}
