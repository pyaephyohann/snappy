import { z } from "zod";

/**
 * Strict: unknown keys, non-boolean values, and empty patches are rejected —
 * the server never maps arbitrary request fields onto database columns.
 */
export const notificationPreferenceUpdateSchema = z
  .strictObject({
    newSnap: z.boolean(),
    message: z.boolean(),
    reaction: z.boolean(),
    comment: z.boolean(),
    birthday: z.boolean(),
    follow: z.boolean(),
    followAccepted: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one preference must be provided",
  });

export type NotificationPreferenceUpdate = z.infer<
  typeof notificationPreferenceUpdateSchema
>;
