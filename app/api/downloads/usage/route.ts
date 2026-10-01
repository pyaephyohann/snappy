import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { getDailyDownloadUsage } from "@/lib/download-service";

export async function GET() {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usage = await getDailyDownloadUsage(user.id);

  return NextResponse.json(
    {
      freeDownloadsUsed: usage.freeDownloadsUsed,
      freeDownloadsRemaining: usage.freeDownloadsRemaining,
      freeDailyDownloads: usage.freeDailyDownloads,
      isFreeExhausted: usage.isFreeExhausted,
    },
    {
      headers: {
        "Cache-Control": "private, no-cache, no-store",
      },
    },
  );
}
