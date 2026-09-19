import { prisma } from "@/lib/prisma";

export const HERO_CAROUSEL_CONFIG_ID = "default";

export interface PublicHeroCarouselSlide {
  id: string;
  imageUrl: string;
  altText: string;
  sortOrder: number;
}

export interface PublicHeroCarouselData {
  title: string | null;
  slides: PublicHeroCarouselSlide[];
}

/**
 * Get today's date components in Asia/Yangon timezone (UTC+6:30).
 */
function getTodayInYangon(): { year: number; month: number; day: number } {
  const now = new Date();
  const yangonTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Yangon" }),
  );
  return {
    year: yangonTime.getFullYear(),
    month: yangonTime.getMonth() + 1, // 1-indexed
    day: yangonTime.getDate(),
  };
}

/**
 * Check if today falls within the 3-day birthday window.
 *
 * Window: birthday day, birthday+1, birthday+2 (calendar days).
 * Example: birthday = Sep 19
 *   Sep 19 → active (day 1)
 *   Sep 20 → active (day 2)
 *   Sep 21 → active (day 3)
 *   Sep 22 → not active
 */
function isInBirthdayWindow(
  birthdayMonth: number,
  birthdayDay: number,
  today: { month: number; day: number },
): boolean {
  // Build the 3-day window starting from the birthday date
  const birthdayBase = new Date(2000, birthdayMonth - 1, birthdayDay);

  for (let offset = 0; offset < 3; offset++) {
    const d = new Date(birthdayBase);
    d.setDate(d.getDate() + offset);
    const windowMonth = d.getMonth() + 1;
    const windowDay = d.getDate();
    if (windowMonth === today.month && windowDay === today.day) {
      return true;
    }
  }

  return false;
}

/**
 * Extract month (1-12) and day (1-31) from a Date stored as birthday.
 * The year is ignored — only month+day matters for birthday comparison.
 */
function extractMonthDay(birthday: Date): { month: number; day: number } {
  // Use UTC to avoid timezone drift on the stored date
  return {
    month: birthday.getUTCMonth() + 1,
    day: birthday.getUTCDate(),
  };
}

/**
 * Resolve the automatic Hero Carousel state.
 *
 * Birthday mode (3-day window):
 *   - Title: "Happy Birthday <username>" (or "Happy Birthday <user1> & <user2>" for multiples)
 *   - Slides: ALL snaps uploaded by the birthday user(s)
 *   - Falls back to Latest Snaps if birthday user has no snaps
 *
 * Normal mode:
 *   - Title: "Latest Snaps"
 *   - Slides: Latest 5 snaps by createdAt desc
 */
export async function getAutomaticHeroCarousel(): Promise<PublicHeroCarouselData> {
  const today = getTodayInYangon();

  // Find all users with a birthday set
  const usersWithBirthday = await prisma.user.findMany({
    where: {
      birthday: { not: null },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      birthday: true,
    },
  });

  // Determine which users have a birthday in the current 3-day window
  const birthdayUsers: Array<{ id: string; name: string }> = [];
  for (const user of usersWithBirthday) {
    if (!user.birthday) continue;
    const { month, day } = extractMonthDay(user.birthday);
    if (isInBirthdayWindow(month, day, today)) {
      birthdayUsers.push({ id: user.id, name: user.name });
    }
  }

  // Birthday mode: if at least one user has a birthday window active
  if (birthdayUsers.length > 0) {
    // Collect ALL snaps uploaded by all birthday users
    const birthdayUserIds = birthdayUsers.map((u) => u.id);
    const birthdaySnaps = await prisma.snap.findMany({
      where: {
        uploadedById: { in: birthdayUserIds },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        imageUrl: true,
        caption: true,
      },
    });

    // If birthday user(s) have snaps, show birthday carousel
    if (birthdaySnaps.length > 0) {
      const title =
        birthdayUsers.length === 1
          ? `Happy Birthday ${birthdayUsers[0].name}`
          : `Happy Birthday ${birthdayUsers.map((u) => u.name).join(" & ")}`;

      return {
        title,
        slides: birthdaySnaps.map((snap, index) => ({
          id: snap.id,
          imageUrl: snap.imageUrl,
          altText: snap.caption?.trim() || "Birthday snap",
          sortOrder: index,
        })),
      };
    }

    // Birthday user(s) exist but have no snaps — fall through to Latest Snaps
  }

  // Normal mode: Latest 5 snaps
  const latestSnaps = await prisma.snap.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      imageUrl: true,
      caption: true,
    },
  });

  return {
    title: "Latest Snaps",
    slides: latestSnaps.map((snap, index) => ({
      id: snap.id,
      imageUrl: snap.imageUrl,
      altText: snap.caption?.trim() || "Snappy hero banner",
      sortOrder: index,
    })),
  };
}

/**
 * @deprecated Use getAutomaticHeroCarousel() instead.
 * Kept for backward compatibility during migration.
 */
export async function getHeroCarouselData(): Promise<PublicHeroCarouselData> {
  return getAutomaticHeroCarousel();
}
