import type { SnapLookupResult } from "@/lib/snap-lookup";

export type MiniAppFindSnapPayload = {
  id: string;
  imageUrl: string;
  username: string;
  createdAt: string;
  caption: string | null;
};

export type MiniAppFindApiResponse =
  | { found: true; snap: MiniAppFindSnapPayload }
  | { found: false; invalidCode?: boolean };

/** Maps T2 lookup results to Mini App-safe JSON (no raw Prisma fields). */
export function mapSnapLookupToMiniAppFindResponse(
  result: SnapLookupResult,
): MiniAppFindApiResponse {
  if (result.status === "invalid_input") {
    return { found: false, invalidCode: true };
  }
  if (result.status === "not_found") {
    return { found: false };
  }
  return {
    found: true,
    snap: {
      id: result.snap.code,
      imageUrl: result.snap.imageUrl,
      username: result.snap.creatorName,
      createdAt: result.snap.createdAt.toISOString(),
      caption: result.snap.caption,
    },
  };
}
