import { prisma } from "@/lib/prisma";
import { buildFriendProfileUrl } from "@/lib/notifications/internal-url";
import { normalizeSnapLookupCode } from "@/lib/snap-code";
import {
  isSnapDiscoverable,
  isTelegramSafeImageUrl,
} from "@/lib/snap-telegram";

export type SnapTelegramDiscovery = {
  code: string;
  caption: string | null;
  imageUrl: string;
  createdAt: Date;
  creatorName: string;
  viewPath: string;
};

export type SnapLookupResult =
  | { status: "invalid_input"; reason: "empty" | "invalid_format" | "too_long" }
  | { status: "not_found" }
  | { status: "found"; snap: SnapTelegramDiscovery };

/**
 * Loads a Snap by its Snap code (Snap.id) for Telegram discovery.
 * Returns not_found when the Snap does not exist or is not discoverable
 * (same visibility as the in-app friend profile: active owner only).
 */
export async function lookupSnapByCode(rawCode: string): Promise<SnapLookupResult> {
  const normalized = normalizeSnapLookupCode(rawCode);
  if (!normalized.ok) {
    return { status: "invalid_input", reason: normalized.reason };
  }

  const snap = await prisma.snap.findUnique({
    where: { id: normalized.code },
    select: {
      id: true,
      imageUrl: true,
      caption: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          isActive: true,
        },
      },
    },
  });

  if (!snap || !isSnapDiscoverable(snap.user.isActive)) {
    return { status: "not_found" };
  }

  if (!isTelegramSafeImageUrl(snap.imageUrl)) {
    return { status: "not_found" };
  }

  return {
    status: "found",
    snap: {
      code: snap.id,
      caption: snap.caption,
      imageUrl: snap.imageUrl,
      createdAt: snap.createdAt,
      creatorName: snap.user.name,
      viewPath: buildFriendProfileUrl(snap.user.name),
    },
  };
}
