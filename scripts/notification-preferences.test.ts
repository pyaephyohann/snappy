/**
 * N1 — Notification Settings / Mute.
 *
 * Core invariant: mute = suppress PWA push delivery. Mute never deletes or
 * prevents Notification records — in-app notification history stays intact.
 *
 * Audit finding: Snappy had no settings/preferences model, so N1 adds the
 * smallest isolated one (`NotificationPreference`, user-level, lazy: a
 * missing row means every category enabled, so existing users keep current
 * push behavior). Enforcement is server-side at the push step of each
 * notifier in lib/notifications/notification-service.ts; broadcast paths
 * (NEW_SNAP, BIRTHDAY) mute per subscription owner.
 *
 * Run: node --env-file-if-exists=.env.local --import tsx --test scripts/notification-preferences.test.ts
 */

import "./test-db-guard";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { webpush } from "../lib/notifications/vapid";
import { notificationPreferenceUpdateSchema } from "../lib/notifications/notification-preference-schema";

const hasDb = Boolean(process.env.DATABASE_URL);
const SKIP = !hasDb ? "DATABASE_URL not set" : false;

const root = resolve(import.meta.dirname, "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const service = read("lib/notifications/notification-service.ts");
const preferencesModule = read("lib/notifications/notification-preferences.ts");
const route = read("app/api/notifications/preferences/route.ts");
const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations/20261002150000_notification_push_preferences/migration.sql",
);
const settingsUi = read("components/notifications/NotificationCategorySettings.tsx");
const notificationsPage = read("app/notifications/page.tsx");

// ===========================================================================
// Request validation (always run)
// ===========================================================================

test("the update schema rejects unknown keys, non-boolean values, and empty patches", () => {
  assert.equal(
    notificationPreferenceUpdateSchema.safeParse({ reaction: false }).success,
    true,
  );
  assert.equal(
    notificationPreferenceUpdateSchema.safeParse({
      reaction: true,
      message: false,
      followAccepted: true,
    }).success,
    true,
  );
  assert.equal(notificationPreferenceUpdateSchema.safeParse({}).success, false);
  assert.equal(
    notificationPreferenceUpdateSchema.safeParse({ reaction: "yes" }).success,
    false,
  );
  assert.equal(
    notificationPreferenceUpdateSchema.safeParse({ reaction: 1 }).success,
    false,
  );
  assert.equal(
    notificationPreferenceUpdateSchema.safeParse({ unknownKey: true }).success,
    false,
  );
  assert.equal(
    notificationPreferenceUpdateSchema.safeParse({ reaction: true, bogus: 1 })
      .success,
    false,
  );
  assert.equal(
    notificationPreferenceUpdateSchema.safeParse("not an object").success,
    false,
  );
});

// ===========================================================================
// Source-level wiring (always run)
// ===========================================================================

test("mute is enforced server-side after the row is created in targeted notifiers", () => {
  const snapFn = service.slice(
    service.indexOf("export async function notifySnapInteraction"),
    service.indexOf("export async function createNewMessageNotification"),
  );
  const messageFn = service.slice(
    service.indexOf("export async function createNewMessageNotification"),
    service.indexOf("export async function notifyFollowEvent"),
  );
  const followFn = service.slice(
    service.indexOf("export async function notifyFollowEvent"),
    service.indexOf("export async function sendBirthdayNotificationIfDue"),
  );

  for (const [name, fn] of [
    ["snap interaction", snapFn],
    ["message", messageFn],
    ["follow", followFn],
  ] as const) {
    const createIndex = fn.indexOf("prisma.notification.create");
    const gateIndex = fn.indexOf("shouldPushNotification");
    const pushIndex = fn.indexOf("prisma.pushSubscription.findMany");
    assert.ok(createIndex > 0, `${name} creates a notification row`);
    assert.ok(
      createIndex < gateIndex,
      `${name} creates the row before consulting the mute preference`,
    );
    assert.ok(gateIndex < pushIndex, `${name} gates before any push work`);
    assert.doesNotMatch(fn.slice(createIndex, gateIndex), /notification\.delete/);
  }

  // Gate inputs: server-derived recipient + notification type only.
  assert.match(snapFn, /shouldPushNotification\(\{ userId: snap\.userId, type \}\)/);
  assert.match(
    messageFn,
    /shouldPushNotification\(\{\s*userId: recipient\.userId,\s*type: "NEW_MESSAGE",\s*\}\)/,
  );
  assert.match(
    followFn,
    /shouldPushNotification\(\{\s*userId: follow\.followingId,\s*type,\s*\}\)/,
  );
});

test("broadcast notifiers mute per subscription owner", () => {
  assert.match(
    service,
    /filterPushableSubscriptions\(\s*await prisma\.pushSubscription\.findMany\(\),\s*"NEW_SNAP",\s*\)/,
  );
  assert.match(
    service,
    /filterPushableSubscriptions\(\s*await prisma\.pushSubscription\.findMany\(\),\s*"BIRTHDAY",\s*\)/,
  );
});

test("the push delivery implementation is untouched", () => {
  const sendFn = service.slice(
    service.indexOf("async function sendPushToSubscription"),
    service.indexOf("/** Broadcasts a new Snap push"),
  );
  // 404/410 cleanup and non-throwing failure behavior are preserved.
  assert.match(sendFn, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(sendFn, /return false/);
  assert.equal(
    (service.match(/prisma\.pushSubscription\s*\n\s*\.delete\(\{/g) ?? []).length,
    1,
  );
  // Muting never deletes notification rows anywhere in the service.
  assert.doesNotMatch(service, /notification\.delete/);
});

test("the preferences API derives the owner from the session and validates strictly", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PATCH/);
  assert.equal((route.match(/await getAuthenticatedAppUser\(\)/g) ?? []).length, 2);
  assert.match(route, /updateNotificationPreferences\(user\.id, parsed\.data\)/);
  assert.match(route, /getNotificationPreferences\(user\.id\)/);
  // The client can never name the preference owner.
  assert.doesNotMatch(route, /body\.userId|recipientId|params\.userId/);
  assert.match(route, /notificationPreferenceUpdateSchema\.safeParse\(body\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 400/);
});

test("the preference module maps every category to its own column and defaults enabled", () => {
  for (const [type, category] of [
    ['NEW_SNAP', "newSnap"],
    ['NEW_MESSAGE', "message"],
    ['REACTION', "reaction"],
    ['COMMENT', "comment"],
    ['BIRTHDAY', "birthday"],
    ['FOLLOW', "follow"],
    ['FOLLOW_ACCEPTED', "followAccepted"],
  ] as const) {
    assert.match(
      preferencesModule,
      new RegExp(`${type}: "${category}"`),
      `${type} maps to ${category}`,
    );
  }
  for (const column of [
    "newSnapPush",
    "messagePush",
    "reactionPush",
    "commentPush",
    "birthdayPush",
    "followPush",
    "followAcceptedPush",
  ]) {
    assert.match(preferencesModule, new RegExp(`"${column}"|: "${column}"|${column}`));
    assert.match(schema, new RegExp(`${column}\\s+Boolean\\s+@default\\(true\\)`));
  }
  // Missing row means enabled — existing users keep push behavior.
  assert.match(preferencesModule, /if \(!row\) \{\s*return true;/);
});

test("the schema change is additive and safe for existing users", () => {
  assert.match(schema, /model NotificationPreference \{/);
  assert.match(schema, /userId\s+String\s+@unique/);
  assert.match(schema, /user User @relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(migration, /CREATE TABLE "notification_preferences"/);
  assert.equal((migration.match(/DEFAULT true/g) ?? []).length, 7);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"\("userId"\)/,
  );
  assert.match(migration, /ON DELETE CASCADE/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
  // The Notification table itself is untouched by N1.
  assert.doesNotMatch(schema, /model Notification \{[^}]*muted/);
});

test("the settings UI is server-driven and never pretends a save succeeded", () => {
  // State is loaded from and saved to the server — not localStorage.
  assert.match(settingsUi, /fetch\("\/api\/notifications\/preferences", \{\s*cache: "no-store",\s*\}\)/);
  assert.match(settingsUi, /method: "PATCH"/);
  assert.doesNotMatch(settingsUi, /localStorage/);

  // Every audited category renders.
  for (const category of [
    "reaction",
    "comment",
    "follow",
    "followAccepted",
    "message",
    "birthday",
    "newSnap",
  ]) {
    assert.match(settingsUi, new RegExp(`key: "${category}",`));
  }

  // Server response is authoritative; failures roll back and surface an error.
  assert.match(settingsUi, /setPreferences\(saved\);/);
  assert.match(settingsUi, /setPreferences\(previous\);/);
  assert.match(settingsUi, /Could not save your preference/);

  // Loading state, double-submit protection, accessible toggles.
  assert.match(settingsUi, /Loading notification settings/);
  assert.match(settingsUi, /if \(!preferences \|\| busy\) \{/);
  assert.match(settingsUi, /disabled=\{busy\}/);
  assert.match(settingsUi, /role="switch"/);
  assert.match(settingsUi, /aria-checked=\{enabled\}/);

  // Hosted on the existing notifications page, below the device push card.
  assert.match(notificationsPage, /<NotificationCategorySettings \/>/);
});

// ===========================================================================
// Database-backed behavior (run with DATABASE_URL)
// ===========================================================================

let prisma: PrismaClient | null = null;
const testUserIds: string[] = [];
const createdEndpoints: string[] = [];
const attempted: string[] = [];

type SendNotificationFn = (
  subscription: { endpoint: string },
  payload: string,
) => Promise<unknown>;
const sendable = webpush as unknown as { sendNotification: SendNotificationFn };
const originalSendNotification = sendable.sendNotification;

const VAPID_ENV_KEYS = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;
const savedVapidEnv: Record<string, string | undefined> = {};

function attemptsFor(endpoints: string[]): number {
  return attempted.filter((endpoint) => endpoints.includes(endpoint)).length;
}

function resetAttempts(): void {
  attempted.length = 0;
}

async function db(): Promise<PrismaClient> {
  if (!prisma) {
    const { PrismaClient: PrismaClientCtor } = await import("@prisma/client");
    prisma = new PrismaClientCtor();
  }
  return prisma;
}

type TestUser = { id: string; name: string };

async function createTestUser(namePrefix: string): Promise<TestUser> {
  const client = await db();
  const name = `${namePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const user = await client.user.create({
    data: { name, profileImage: "https://example.com/avatar.jpg" },
  });
  testUserIds.push(user.id);
  return { id: user.id, name: user.name };
}

async function createTestSubscription(
  userId: string,
  tag: string,
): Promise<string> {
  const client = await db();
  const endpoint = `https://push.test/notif-pref/${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createdEndpoints.push(endpoint);
  await client.pushSubscription.create({
    data: {
      endpoint,
      p256dh: "test-p256dh",
      auth: "test-auth",
      deviceId: `notif-pref-device-${tag}`,
      userId,
    },
  });
  return endpoint;
}

async function setPrefs(
  userId: string,
  patch: Partial<Record<string, boolean>>,
): Promise<void> {
  const { updateNotificationPreferences } = await import(
    "../lib/notifications/notification-preferences"
  );
  await updateNotificationPreferences(
    userId,
    patch as Parameters<typeof updateNotificationPreferences>[1],
  );
}

async function createTestSnap(ownerId: string, tag: string): Promise<string> {
  const client = await db();
  const snap = await client.snap.create({
    data: {
      imageUrl: "https://example.com/snap.jpg",
      publicId: `notif-pref-${tag}-${ownerId}`,
      userId: ownerId,
    },
  });
  return snap.id;
}

before(async () => {
  for (const key of VAPID_ENV_KEYS) {
    savedVapidEnv[key] = process.env[key];
  }
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.VAPID_SUBJECT = "mailto:test@example.com";

  sendable.sendNotification = async (subscription, payload) => {
    attempted.push(subscription.endpoint);
    void payload;
    return { statusCode: 201 };
  };

  if (!hasDb) return;
  const client = await db();
  await client.user.deleteMany({
    where: { name: { startsWith: "notif_pref_" } },
  });
  await client.pushSubscription.deleteMany({
    where: { endpoint: { startsWith: "https://push.test/notif-pref/" } },
  });
});

after(async () => {
  sendable.sendNotification = originalSendNotification;
  for (const key of VAPID_ENV_KEYS) {
    const value = savedVapidEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (!prisma) return;
  if (createdEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: createdEndpoints } },
    });
  }
  if (testUserIds.length > 0) {
    // Cascades remove follows, conversations, messages, notifications, prefs.
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  }
  await prisma.$disconnect();
});

test("defaults are enabled: a missing preference row preserves push behavior", {
  skip: SKIP,
}, async () => {
  const { getNotificationPreferences, shouldPushNotification } = await import(
    "../lib/notifications/notification-preferences"
  );
  const user = await createTestUser("notif_pref_defaults");

  const preferences = await getNotificationPreferences(user.id);
  assert.deepEqual(preferences, {
    newSnap: true,
    message: true,
    reaction: true,
    comment: true,
    birthday: true,
    follow: true,
    followAccepted: true,
  });

  for (const type of [
    "NEW_SNAP",
    "NEW_MESSAGE",
    "REACTION",
    "COMMENT",
    "BIRTHDAY",
    "FOLLOW",
    "FOLLOW_ACCEPTED",
  ] as const) {
    assert.equal(
      await shouldPushNotification({ userId: user.id, type }),
      true,
      `${type} pushes by default`,
    );
  }
});

test("REACTION: muted = row created with no push; enabled = push attempted", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  const owner = await createTestUser("notif_pref_react_owner");
  const actor = await createTestUser("notif_pref_react_actor");
  const ownerEndpoint = await createTestSubscription(owner.id, "react-owner");
  const snapId = await createTestSnap(owner.id, "react");

  await setPrefs(owner.id, { reaction: false });
  resetAttempts();
  await client.reaction.create({
    data: { type: "LIKE", userId: actor.id, snapId },
  });
  await notifySnapInteraction({
    snapId,
    actorId: actor.id,
    type: "REACTION",
    body: "\u2764\ufe0f",
  });

  const rows = await client.notification.findMany({
    where: { userId: owner.id, snapId, type: "REACTION" },
  });
  assert.equal(rows.length, 1, "the Notification row is still created");
  assert.equal(attemptsFor([ownerEndpoint]), 0, "muted: no push attempted");

  await setPrefs(owner.id, { reaction: true });
  resetAttempts();
  await notifySnapInteraction({
    snapId,
    actorId: actor.id,
    type: "REACTION",
    body: "\u2764\ufe0f",
  });
  assert.equal(attemptsFor([ownerEndpoint]), 1, "enabled: push attempted");
});

test("COMMENT: muted = row created with no push; enabled = push attempted", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifySnapInteraction } = await import(
    "../lib/notifications/notification-service"
  );
  const owner = await createTestUser("notif_pref_comm_owner");
  const actor = await createTestUser("notif_pref_comm_actor");
  const ownerEndpoint = await createTestSubscription(owner.id, "comm-owner");
  const snapId = await createTestSnap(owner.id, "comm");

  await setPrefs(owner.id, { comment: false });
  resetAttempts();
  await client.comment.create({
    data: { content: "Nice!", userId: actor.id, snapId },
  });
  await notifySnapInteraction({
    snapId,
    actorId: actor.id,
    type: "COMMENT",
    body: "Nice!",
  });

  const rows = await client.notification.findMany({
    where: { userId: owner.id, snapId, type: "COMMENT" },
  });
  assert.equal(rows.length, 1, "the Notification row is still created");
  assert.equal(attemptsFor([ownerEndpoint]), 0, "muted: no push attempted");

  await setPrefs(owner.id, { comment: true });
  resetAttempts();
  await notifySnapInteraction({
    snapId,
    actorId: actor.id,
    type: "COMMENT",
    body: "Nice!",
  });
  assert.equal(attemptsFor([ownerEndpoint]), 1, "enabled: push attempted");
});

test("FOLLOW: muted = row created with no push; enabled = push attempted", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifyFollowEvent } = await import(
    "../lib/notifications/notification-service"
  );
  const target = await createTestUser("notif_pref_follow_t");
  const follower = await createTestUser("notif_pref_follow_f");
  const targetEndpoint = await createTestSubscription(target.id, "follow-t");

  await setPrefs(target.id, { follow: false });
  resetAttempts();
  await client.userFollow.create({
    data: { followerId: follower.id, followingId: target.id },
  });
  await notifyFollowEvent({
    followerId: follower.id,
    followingId: target.id,
  });

  const rows = await client.notification.findMany({
    where: { userId: target.id, type: "FOLLOW" },
  });
  assert.equal(rows.length, 1, "the Notification row is still created");
  assert.equal(attemptsFor([targetEndpoint]), 0, "muted: no push attempted");

  await setPrefs(target.id, { follow: true });
  resetAttempts();
  await notifyFollowEvent({
    followerId: follower.id,
    followingId: target.id,
  });
  assert.equal(attemptsFor([targetEndpoint]), 1, "enabled: push attempted");
});

test("FOLLOW_ACCEPTED: muted = row created with no push; enabled = push attempted", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { notifyFollowEvent } = await import(
    "../lib/notifications/notification-service"
  );
  const userA = await createTestUser("notif_pref_acc_a");
  const userB = await createTestUser("notif_pref_acc_b");
  const aEndpoint = await createTestSubscription(userA.id, "acc-a");

  await client.userFollow.create({
    data: { followerId: userA.id, followingId: userB.id },
  });

  await setPrefs(userA.id, { followAccepted: false });
  resetAttempts();
  await client.userFollow.create({
    data: { followerId: userB.id, followingId: userA.id },
  });
  await notifyFollowEvent({ followerId: userB.id, followingId: userA.id });

  const rows = await client.notification.findMany({
    where: { userId: userA.id, type: "FOLLOW_ACCEPTED" },
  });
  assert.equal(rows.length, 1, "the Notification row is still created");
  assert.equal(attemptsFor([aEndpoint]), 0, "muted: no push attempted");

  await setPrefs(userA.id, { followAccepted: true });
  resetAttempts();
  await notifyFollowEvent({ followerId: userB.id, followingId: userA.id });
  assert.equal(attemptsFor([aEndpoint]), 1, "enabled: push attempted");
});

test("NEW_MESSAGE: muted = row created with no push; enabled = push attempted", {
  skip: SKIP,
}, async () => {
  const client = await db();
  const { createNewMessageNotification } = await import(
    "../lib/notifications/notification-service"
  );
  const sender = await createTestUser("notif_pref_msg_s");
  const recipient = await createTestUser("notif_pref_msg_r");
  const recipientEndpoint = await createTestSubscription(
    recipient.id,
    "msg-r",
  );

  const [lowId, highId] = [sender.id, recipient.id].sort();
  const conversation = await client.conversation.create({
    data: {
      userLowId: lowId,
      userHighId: highId,
      participants: {
        create: [{ userId: sender.id }, { userId: recipient.id }],
      },
    },
  });

  await setPrefs(recipient.id, { message: false });
  resetAttempts();
  const message = await client.message.create({
    data: { conversationId: conversation.id, senderId: sender.id, content: "Hi" },
  });
  await createNewMessageNotification({ messageId: message.id });

  const rows = await client.notification.findMany({
    where: { userId: recipient.id, type: "NEW_MESSAGE" },
  });
  assert.equal(rows.length, 1, "the Notification row is still created");
  assert.equal(attemptsFor([recipientEndpoint]), 0, "muted: no push attempted");

  await setPrefs(recipient.id, { message: true });
  resetAttempts();
  // A new message is required: a retried delivery of the same message is
  // deduped by the unique messageId before any push (existing behavior).
  const secondMessage = await client.message.create({
    data: {
      conversationId: conversation.id,
      senderId: sender.id,
      content: "Hi again",
    },
  });
  await createNewMessageNotification({ messageId: secondMessage.id });
  assert.equal(attemptsFor([recipientEndpoint]), 1, "enabled: push attempted");
});

test("BIRTHDAY: per-owner mute skips only the muted user's devices", {
  skip: SKIP,
}, async () => {
  const { sendBirthdayNotificationIfDue } = await import(
    "../lib/notifications/notification-service"
  );
  const muted = await createTestUser("notif_pref_bday_muted");
  const enabled = await createTestUser("notif_pref_bday_enabled");
  const mutedEndpoints = [
    await createTestSubscription(muted.id, "bday-m1"),
    await createTestSubscription(muted.id, "bday-m2"),
  ];
  const enabledEndpoint = await createTestSubscription(enabled.id, "bday-e");

  await setPrefs(muted.id, { birthday: false });
  resetAttempts();
  await sendBirthdayNotificationIfDue({ userId: muted.id, username: muted.name });

  const client = await db();
  const rows = await client.notification.findMany({
    where: { userId: muted.id, type: "BIRTHDAY" },
  });
  assert.equal(rows.length, 1, "the Notification row is still created");
  assert.equal(attemptsFor(mutedEndpoints), 0, "muted: 0 pushes across devices");

  resetAttempts();
  await sendBirthdayNotificationIfDue({
    userId: enabled.id,
    username: enabled.name,
  });
  assert.equal(attemptsFor([enabledEndpoint]), 1, "enabled: push attempted");
});

test("NEW_SNAP: per-owner mute skips only the muted user's devices", {
  skip: SKIP,
}, async () => {
  const { broadcastNewSnap } = await import(
    "../lib/notifications/notification-service"
  );
  const muted = await createTestUser("notif_pref_snap_muted");
  const enabled = await createTestUser("notif_pref_snap_enabled");
  const mutedEndpoint = await createTestSubscription(muted.id, "snap-m");
  const enabledEndpoint = await createTestSubscription(enabled.id, "snap-e");

  await setPrefs(muted.id, { newSnap: false });
  resetAttempts();
  await broadcastNewSnap({
    snapId: "n1-test-snap",
    profileOwnerName: muted.name,
    uploaderName: "Someone",
  });

  assert.equal(attemptsFor([mutedEndpoint]), 0, "muted: no push attempted");
  assert.equal(attemptsFor([enabledEndpoint]), 1, "enabled: push attempted");
});

test("a mute applies across all of a user's subscriptions", { skip: SKIP }, async () => {
  const client = await db();
  const { createNewMessageNotification } = await import(
    "../lib/notifications/notification-service"
  );
  const sender = await createTestUser("notif_pref_multi_s");
  const recipient = await createTestUser("notif_pref_multi_r");
  const endpoints = [
    await createTestSubscription(recipient.id, "multi-1"),
    await createTestSubscription(recipient.id, "multi-2"),
    await createTestSubscription(recipient.id, "multi-3"),
  ];

  const [lowId, highId] = [sender.id, recipient.id].sort();
  const conversation = await client.conversation.create({
    data: {
      userLowId: lowId,
      userHighId: highId,
      participants: {
        create: [{ userId: sender.id }, { userId: recipient.id }],
      },
    },
  });
  const message = await client.message.create({
    data: {
      conversationId: conversation.id,
      senderId: sender.id,
      content: "Multi device",
    },
  });

  await setPrefs(recipient.id, { message: false });
  resetAttempts();
  await createNewMessageNotification({ messageId: message.id });
  assert.equal(attemptsFor(endpoints), 0, "0 pushes across all user subscriptions");

  await setPrefs(recipient.id, { message: true });
  resetAttempts();
  // A new message is required: repeated processing of one message is
  // deduped by the unique messageId before any push (existing behavior).
  const secondMessage = await client.message.create({
    data: {
      conversationId: conversation.id,
      senderId: sender.id,
      content: "Multi device again",
    },
  });
  await createNewMessageNotification({ messageId: secondMessage.id });
  assert.equal(
    attemptsFor(endpoints),
    endpoints.length,
    "enabled: every owned subscription receives",
  );
});

test("one user's preferences never affect another user's push behavior", {
  skip: SKIP,
}, async () => {
  const { getNotificationPreferences, shouldPushNotification } = await import(
    "../lib/notifications/notification-preferences"
  );
  const userA = await createTestUser("notif_pref_iso_a");
  const userB = await createTestUser("notif_pref_iso_b");

  await setPrefs(userA.id, {
    reaction: false,
    comment: false,
    follow: false,
    followAccepted: false,
    message: false,
    birthday: false,
    newSnap: false,
  });

  assert.equal(
    await shouldPushNotification({ userId: userA.id, type: "REACTION" }),
    false,
  );
  assert.equal(
    await shouldPushNotification({ userId: userB.id, type: "REACTION" }),
    true,
    "B keeps the enabled default",
  );

  const prefsB = await getNotificationPreferences(userB.id);
  assert.equal(Object.values(prefsB).every(Boolean), true);

  const client = await db();
  const rows = await client.notificationPreference.findMany({
    where: { userId: { in: [userA.id, userB.id] } },
  });
  assert.equal(rows.length, 1, "only A has a preference row");
  assert.equal(rows[0].userId, userA.id);
});
