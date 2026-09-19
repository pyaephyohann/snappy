import { prisma } from "@/lib/prisma";
import { sendBirthdayNotificationIfDue } from "@/lib/notifications/notification-service";

/**
 * Get today's month/day in Asia/Yangon timezone.
 */
function getTodayMonthDay(): { month: number; day: number } {
  const now = new Date();
  const yangonTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Yangon" }),
  );
  return {
    month: yangonTime.getMonth() + 1,
    day: yangonTime.getDate(),
  };
}

/**
 * Check if today falls within the 3-day birthday window.
 * Birthday notifications are sent on the first day only.
 */
function isBirthdayToday(
  birthday: Date,
  today: { month: number; day: number },
): boolean {
  const birthdayMonth = birthday.getUTCMonth() + 1;
  const birthdayDay = birthday.getUTCDate();
  return birthdayMonth === today.month && birthdayDay === today.day;
}

/**
 * Trigger birthday notifications for all users whose birthday is today.
 * Deduplication is handled inside sendBirthdayNotificationIfDue —
 * a BIRTHDAY notification is only created once per user per day.
 *
 * This is designed to be called from server components (e.g. home page).
 * The void return allows fire-and-forget usage.
 */
export async function triggerBirthdayNotifications(): Promise<void> {
  try {
    const today = getTodayMonthDay();

    // Find all active users with a birthday set
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

    // Filter to users whose birthday is today
    const todayBirthdays = usersWithBirthday.filter(
      (user) => user.birthday && isBirthdayToday(user.birthday, today),
    );

    if (todayBirthdays.length === 0) {
      return;
    }

    // Send notifications (each is deduplicated internally)
    await Promise.all(
      todayBirthdays.map((user) =>
        sendBirthdayNotificationIfDue({
          userId: user.id,
          username: user.name,
        }),
      ),
    );
  } catch (error) {
    console.error("[Birthday] Failed to trigger birthday notifications:", error);
  }
}
