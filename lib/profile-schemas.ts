import { z } from "zod";

export const profileNameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(50, "Name must be less than 50 characters")
  .trim();

export const profilePasscodeSchema = z
  .string()
  .min(4, "Passcode must be at least 4 characters")
  .max(128, "Passcode must be less than 128 characters");

export const updateProfileSchema = z
  .object({
    name: profileNameSchema.optional(),
    passcode: profilePasscodeSchema.optional(),
  })
  .refine((data) => data.name !== undefined || data.passcode !== undefined, {
    message: "Nothing to update",
  });

export const updateProfilePhotoSchema = z.object({
  snapId: z.string().min(1, "Snap ID is required"),
});

export const profilePhotoGalleryUploadSchema = z.object({
  imageUrl: z.string().url("Invalid image URL"),
  publicId: z.string().min(1, "Public ID is required"),
});

export const profilePhotoGalleryPaymentSchema = z.object({
  method: z.enum(["kpay", "aya", "uab"]),
});
