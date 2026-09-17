import { CLOUDINARY_SNAP_FOLDER_RAW } from "@/lib/snap-validation";

export type CloudinaryUploadResult = {
  secureUrl: string;
  publicId: string;
};

export async function uploadSnapImageBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<CloudinaryUploadResult> {
  const { v2: cloudinary } = await import("cloudinary");

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not configured");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  const extension = mimeTypeToExtension(mimeType);
  const result = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: CLOUDINARY_SNAP_FOLDER_RAW,
          resource_type: "image",
          format: extension,
        },
        (error, uploadResult) => {
          if (error || !uploadResult?.secure_url || !uploadResult.public_id) {
            reject(error ?? new Error("Cloudinary upload failed"));
            return;
          }
          resolve({
            secure_url: uploadResult.secure_url,
            public_id: uploadResult.public_id,
          });
        },
      );
      upload.end(buffer);
    },
  );

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
  };
}

function mimeTypeToExtension(mimeType: string): string | undefined {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return undefined;
  }
}
