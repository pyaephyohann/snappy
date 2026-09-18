import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  IMAGE_OPTIMIZATION_MAX_DIMENSION,
  IMAGE_OPTIMIZATION_WEBP_QUALITY,
  ImageOptimizationError,
  optimizeRasterImage,
} from "../lib/image-optimization";

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

test("optimizes JPEG to real WebP and bounds large dimensions", async () => {
  const input = await sharp({
    create: {
      width: 6000,
      height: 3000,
      channels: 3,
      background: { r: 40, g: 90, b: 180 },
    },
  })
    .jpeg()
    .toBuffer();

  const optimized = await optimizeRasterImage(input, "image/jpeg");
  const metadata = await sharp(optimized.buffer).metadata();

  assert.equal(optimized.mimeType, "image/webp");
  assert.equal(optimized.inputMimeType, "image/jpeg");
  assert.equal(isWebp(optimized.buffer), true);
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, IMAGE_OPTIMIZATION_MAX_DIMENSION);
  assert.equal(metadata.height, IMAGE_OPTIMIZATION_MAX_DIMENSION / 2);
  assert.equal(optimized.buffer.length > 0, true);
});

test("preserves small portrait dimensions and transparent PNG content", async () => {
  const input = await sharp({
    create: {
      width: 240,
      height: 480,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.35 },
    },
  })
    .png()
    .toBuffer();

  const optimized = await optimizeRasterImage(input, "image/png");
  const metadata = await sharp(optimized.buffer).metadata();

  assert.equal(isWebp(optimized.buffer), true);
  assert.equal(metadata.width, 240);
  assert.equal(metadata.height, 480);
  assert.equal(metadata.hasAlpha, true);
});

test("corrects EXIF orientation while preserving the visual aspect ratio", async () => {
  const input = await sharp({
    create: {
      width: 100,
      height: 50,
      channels: 3,
      background: { r: 80, g: 40, b: 180 },
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

  const optimized = await optimizeRasterImage(input, "image/jpeg");
  const metadata = await sharp(optimized.buffer).metadata();

  assert.equal(metadata.width, 50);
  assert.equal(metadata.height, 100);
  assert.equal(isWebp(optimized.buffer), true);
});

test("accepts WebP and does not enlarge very small images", async () => {
  const input = await sharp({
    create: {
      width: 32,
      height: 20,
      channels: 3,
      background: { r: 0, g: 180, b: 90 },
    },
  })
    .webp({ quality: IMAGE_OPTIMIZATION_WEBP_QUALITY })
    .toBuffer();

  const optimized = await optimizeRasterImage(input, "image/webp");
  const metadata = await sharp(optimized.buffer).metadata();

  assert.equal(metadata.width, 32);
  assert.equal(metadata.height, 20);
  assert.equal(isWebp(optimized.buffer), true);
});

test("rejects invalid input and converts supported GIF input", async () => {
  await assert.rejects(
    () => optimizeRasterImage(Buffer.from("not an image"), "image/jpeg"),
    (error: unknown) =>
      error instanceof ImageOptimizationError && error.code === "invalid_image",
  );

  const gif = await sharp({
    create: {
      width: 10,
      height: 10,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .gif()
    .toBuffer();

  const optimized = await optimizeRasterImage(gif, "image/gif");
  assert.equal(isWebp(optimized.buffer), true);
  assert.equal((await sharp(optimized.buffer).metadata()).format, "webp");
});
