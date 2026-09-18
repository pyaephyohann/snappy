import { optimizeRasterImage } from "@/lib/image-optimization";
import { CLOUDINARY_SNAP_FOLDER_RAW } from "@/lib/snap-validation";

export type CloudinaryUploadResult = {
  secureUrl: string;
  publicId: string;
};

export async function uploadSnapImageBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<CloudinaryUploadResult> {
  const optimized = await optimizeRasterImage(buffer, mimeType);
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

  const result = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: CLOUDINARY_SNAP_FOLDER_RAW,
          resource_type: "image",
          format: "webp",
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
      upload.end(optimized.buffer);
    },
  );

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
  };
}

