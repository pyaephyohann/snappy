/**
 * Client-side snap upload flow (Cloudinary sign → upload → POST /api/snaps).
 * Shared by profile uploader and mobile bottom-nav camera.
 */
export async function uploadSnapForUser(
  targetUserId: string,
  file: File,
  caption?: string,
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureResponse = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timestamp }),
  });

  if (!signatureResponse.ok) {
    throw new Error("Unable to start upload. Please try again.");
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
    throw new Error("Image upload failed. Please try again.");
  }

  const uploadData = await uploadResponse.json();

  const snapResponse = await fetch("/api/snaps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUserId,
      imageUrl: uploadData.secure_url,
      publicId: uploadData.public_id,
      caption: caption || undefined,
    }),
  });

  if (!snapResponse.ok) {
    throw new Error(
      "Image uploaded, but we could not save the Snap. Please try again.",
    );
  }
}
