import { prisma } from "@/lib/prisma";

/**
 * User-facing push preference categories. The API speaks these stable keys;
 * they are mapped to persisted columns here so database naming can evolve
 * without changing the client contract.
 */
export type NotificationPushCategory =
  | "newSnap"
  | "message"
  | "reaction"
  | "comment"
  | "birthday"
  | "follow"
  | "followAccepted";

export type NotificationPushPreferences = Record<
  NotificationPushCategory,
  boolean
>;

/** The push delivery type of every notification category N1 can mute. */
export type NotificationPushType =
  | "NEW_SNAP"
  | "NEW_MESSAGE"
  | "REACTION"
  | "COMMENT"
  | "BIRTHDAY"
  | "FOLLOW"
  | "FOLLOW_ACCEPTED";

const TYPE_TO_CATEGORY: Record<NotificationPushType, NotificationPushCategory> =
  {
    NEW_SNAP: "newSnap",
    NEW_MESSAGE: "message",
    REACTION: "reaction",
    COMMENT: "comment",
    BIRTHDAY: "birthday",
    FOLLOW: "follow",
    FOLLOW_ACCEPTED: "followAccepted",
  };

const CATEGORY_TO_COLUMN: Record<
  NotificationPushCategory,
  keyof NotificationPreferenceRow
> = {
  newSnap: "newSnapPush",
  message: "messagePush",
  reaction: "reactionPush",
  comment: "commentPush",
  birthday: "birthdayPush",
  follow: "followPush",
  followAccepted: "followAcceptedPush",
};

type NotificationPreferenceRow = {
  newSnapPush: boolean;
  messagePush: boolean;
  reactionPush: boolean;
  commentPush: boolean;
  birthdayPush: boolean;
  followPush: boolean;
  followAcceptedPush: boolean;
};

const ALL_ENABLED: NotificationPushPreferences = {
  newSnap: true,
  message: true,
  reaction: true,
  comment: true,
  birthday: true,
  follow: true,
  followAccepted: true,
};

function toPreferences(
  row: NotificationPreferenceRow | null,
): NotificationPushPreferences {
  if (!row) {
    return { ...ALL_ENABLED };
  }
  return {
    newSnap: row.newSnapPush,
    message: row.messagePush,
    reaction: row.reactionPush,
    comment: row.commentPush,
    birthday: row.birthdayPush,
    follow: row.followPush,
    followAccepted: row.followAcceptedPush,
  };
}

/**
 * Reads a user's effective push preferences. A missing row means every
 * category is enabled: existing users keep their current push behavior until
 * they explicitly mute something.
 */
export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPushPreferences> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  return toPreferences(row);
}

/**
 * Updates the authenticated user's preferences. Only the provided category
 * keys change; everything else keeps its current value. The row is created
 * lazily on first update with all remaining categories enabled.
 */
export async function updateNotificationPreferences(
  userId: string,
  patch: Partial<NotificationPushPreferences>,
): Promise<NotificationPushPreferences> {
  const data: Partial<NotificationPreferenceRow> = {};
  for (const [category, enabled] of Object.entries(patch)) {
    if (enabled === undefined) {
      continue;
    }
    data[CATEGORY_TO_COLUMN[category as NotificationPushCategory]] = enabled;
  }

  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  return getNotificationPreferences(userId);
}

/**
 * Server-authoritative push gate: decides whether Web Push delivery may be
 * attempted for a notification type owned by `userId`. Missing preference
 * rows are enabled. `userId: null` (orphaned subscription rows) keeps the
 * existing broadcast behavior and stays enabled.
 */
export async function shouldPushNotification({
  userId,
  type,
}: {
  userId: string | null | undefined;
  type: NotificationPushType;
}): Promise<boolean> {
  if (!userId) {
    return true;
  }

  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  if (!row) {
    return true;
  }

  return row[CATEGORY_TO_COLUMN[TYPE_TO_CATEGORY[type]]];
}

/**
 * Filters broadcast deliveries to subscriptions whose owner has the category
 * enabled. User-level: all devices of a muted user are skipped together.
 */
export async function filterPushableSubscriptions<
  T extends { userId: string | null },
>(subscriptions: T[], type: NotificationPushType): Promise<T[]> {
  const userIds = [...new Set(subscriptions.map((subscription) => subscription.userId))];
  const decisions = new Map<string | null, boolean>();
  await Promise.all(
    userIds.map(async (userId) => {
      decisions.set(userId, await shouldPushNotification({ userId, type }));
    }),
  );
  return subscriptions.filter((subscription) =>
    decisions.get(subscription.userId),
  );
}
