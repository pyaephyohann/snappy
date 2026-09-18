import sharp from "sharp";
import {
  SNAP_MAX_IMAGE_BYTES,
  validateSnapImageBuffer,
} from "@/lib/snap-media";

export const IMAGE_OPTIMIZATION_MAX_DIMENSION = 4096;
export const IMAGE_OPTIMIZATION_MAX_INPUT_PIXELS = 64_000_000;
export const IMAGE_OPTIMIZATION_WEBP_QUALITY = 82;

export type OptimizedImage = {
  buffer: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
  inputMimeType: string;
};

export class ImageOptimizationError extends Error {
  readonly code:
    | "empty"
    | "too_large"
    | "unsupported_type"
    | "invalid_image"
    | "processing_failed";

  constructor(
    code: ImageOptimizationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "ImageOptimizationError";
    this.code = code;
  }
}

/**
 * Validates actual image bytes, applies EXIF orientation, bounds dimensions,
 * and emits a real WebP binary for Cloudinary or another image upload target.
 */
export async function optimizeRasterImage(
  input: Buffer,
  declaredMimeType?: string | null,
): Promise<OptimizedImage> {
  const validation = validateSnapImageBuffer(input, declaredMimeType);
  if (!validation.ok) {
    throw new ImageOptimizationError(
      validation.reason,
      imageValidationMessage(validation.reason),
    );
  }

  try {
    const output = await sharp(input, {
      failOn: "error",
      limitInputPixels: IMAGE_OPTIMIZATION_MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: IMAGE_OPTIMIZATION_MAX_DIMENSION,
        height: IMAGE_OPTIMIZATION_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: IMAGE_OPTIMIZATION_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    if (!output.data.length || output.data.length > SNAP_MAX_IMAGE_BYTES) {
      throw new ImageOptimizationError(
        "processing_failed",
        "Optimized image exceeds the maximum allowed size",
      );
    }

    return {
      buffer: output.data,
      mimeType: "image/webp",
      width: output.info.width,
      height: output.info.height,
      inputMimeType: validation.mimeType,
    };
  } catch (error) {
    if (error instanceof ImageOptimizationError) {
      throw error;
    }
    throw new ImageOptimizationError(
      "processing_failed",
      "The image could not be processed safely",
    );
  }
}

function imageValidationMessage(
  reason: "empty" | "too_large" | "unsupported_type" | "invalid_image",
): string {
  switch (reason) {
    case "empty":
      return "The uploaded image is empty";
    case "too_large":
      return "The uploaded image is too large";
    case "unsupported_type":
      return "That image format is not supported";
    case "invalid_image":
      return "The uploaded file is not a valid image";
  }
}