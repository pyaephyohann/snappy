/**
 * S3 — Caption Editing tests.
 *
 * Source-level tests always run. Database-backed tests use only users created
 * by this file and skip when DATABASE_URL is unavailable.
 *
 * Run: npm run test:spark-s3
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";

const hasDb = Boolean(process.env.DATABASE_URL);
const CAPTION_EDIT_COST_SPARKS = 2;
const testUserIds: string[] = [];
let prisma: PrismaClient | null = null;
let sequence = 0;

function read(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, "..", relativePath), "utf8");
}

async function db(): Promise<PrismaClient> {
  if (!prisma) {
    const { PrismaClient: PrismaClientCtor } = await import("@prisma/client");
    prisma = new PrismaClientCtor();
  }
  return prisma;
}

async function createUser(name: string): Promise<string> {
  const client = await db();
  const user = await client.user.create({
    data: { name, profileImage: "https://example.com/s3-test.jpg" },
  });
  testUserIds.push(user.id);
  return user.id;
}

async function createSnap(userId: string, caption: string | null) {
  const client = await db();
  return client.snap.create({
    data: {
      userId,
      uploadedById: userId,
      imageUrl: "https://res.cloudinary.com/test/image/upload/s3-caption.jpg",
      publicId: `test/s3-caption-${Date.now()}-${++sequence}`,
      caption,
    },
  });
}

async function seedEarnedSparks(userId: string, amount: number) {
  const client = await db();
  return client.sparkTransaction.create({
    data: {
      userId,
      amount,
      type: "ADMIN_ADJUSTMENT",
      source: "ADMIN",
      sparkKind: "EARNED",
      referenceType: "s3-test",
      referenceId: `s3-seed-${userId}-${Date.now()}-${++sequence}`,
    },
  });
}

after(async () => {
  if (!prisma) return;
  for (const userId of testUserIds) {
    await prisma.sparkTransaction.deleteMany({ where: { userId } });
    await prisma.snap.deleteMany({
      where: { OR: [{ userId }, { uploadedById: userId }] },
    });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ===========================================================================
// Source-level integration checks
// ===========================================================================

test("caption API returns server Spark result and refreshed usage", () => {
  const route = read("app/api/snaps/[snapId]/caption/route.ts");
  assert.match(route, /updateSnapCaptionWithSparkAccounting/);
  assert.match(route, /sparkSpent/);
  assert.match(route, /idempotent/);
  assert.match(route, /noOp/);
  assert.match(route, /getSparkUsageSummary/);
  assert.match(route, /code: "insufficient_sparks"/);
  assert.match(route, /status: 403/);
});

test("caption service keeps authorization, charge, and update transactional", () => {
  const service = read("lib/snap-caption-service.ts");
  assert.match(service, /prisma\.\$transaction/);
  assert.match(service, /snap\.uploadedById !== input\.userId/);
  assert.match(service, /atomicSpendSparks/);
  assert.match(service, /type: "CAPTION_EDIT"/);
  assert.match(service, /tx\.snap\.update/);
  assert.match(service, /P2002/);
});

test("caption editor communicates cost, confirms, blocks insufficient balance, and adopts usage", () => {
  const viewer = read("components/snaps/SnapViewer.tsx");
  assert.match(viewer, /useSparkUsage/);
  assert.match(viewer, /captionEditCost/);
  assert.match(viewer, /canAffordCaptionEdit/);
  assert.match(viewer, /Edit caption for \{usage\.captionEditCost\} Sparks/);
  assert.match(viewer, /Save for \{usage\.captionEditCost\} Sparks/);
  assert.match(viewer, /applyUsage\(result\.usage\)/);
  assert.match(viewer, /Caption updated/);
  assert.match(viewer, /sparkSpent/);
  assert.match(viewer, /No Sparks spent/);
  assert.doesNotMatch(viewer, /CAPTION_EDIT_COST_SPARKS\s*=/);
});

test("My Snaps remains the only caption-edit surface and Telegram is not forked", () => {
  const profile = read("components/profile/ProfilePageClient.tsx");
  assert.match(profile, /canEditCaptions/);
  const gallery = read("components/friends/SnapGallery.tsx");
  assert.match(gallery, /canEditCaption=\{canEditCaptions\}/);
  const friendProfile = read("components/friends/FriendProfileClient.tsx");
  assert.doesNotMatch(friendProfile, /canEditCaption/);
  const bot = read("lib/telegram/upload-snap.ts");
  assert.doesNotMatch(bot, /\/caption/);
});

test("S3 documentation distinguishes caption editing from S1/S2", () => {
  const docs = read("docs/spark-economy.md");
  assert.match(docs, /## S3 — Caption Editing/);
  assert.match(docs, /Caption edit \| \*\*2 Sparks\*\*/);
  assert.match(docs, /S1 accounting/);
  assert.match(docs, /S2 upload rules/);
  assert.match(docs, /no caption-edit surface/);
});

// ===========================================================================
// Database-backed behavior
// ===========================================================================

test(
  "successful caption edit updates caption and spends exactly 2 Sparks",
  { skip: !hasDb ? "DATABASE_URL not set" : false },
  async () => {
    const { getSparkBalance, getSparkUsageSummary } = await import(
      "../lib/spark-service"
    );
    const { updateSnapCaptionWithSparkAccounting } = await import(
      "../lib/snap-caption-service"
    );
    const userId = await createUser("s3-success");
    const snap = await createSnap(userId, "before");
    await seedEarnedSparks(userId, 5);

    const result = await updateSnapCaptionWithSparkAccounting({
      userId,
      snapId: snap.id,
      caption: "after",
      idempotencyKey: `s3-edit-${snap.id}`,
    });

    assert.equal(result.snap.caption, "after");
    assert.equal(result.sparkSpent, CAPTION_EDIT_COST_SPARKS);
    assert.equal(result.idempotent, false);
    assert.equal(result.noOp, false);
    assert.equal((await getSparkBalance(userId)).total, 3);
    assert.equal((await getSparkUsageSummary(userId)).balance, 3);
  },
);

test(
  "insufficient Sparks leaves caption and ledger unchanged",
  { skip: !hasDb ? "DATABASE_URL not set" : false },
  async () => {
    const { SparkServiceError, getSparkBalance } = await import(
      "../lib/spark-service"
    );
    const { updateSnapCaptionWithSparkAccounting } = await import(
      "../lib/snap-caption-service"
    );
    const client = await db();
    const userId = await createUser("s3-insufficient");
    const snap = await createSnap(userId, "original");
    await seedEarnedSparks(userId, 1);

    await assert.rejects(
      () =>
        updateSnapCaptionWithSparkAccounting({
          userId,
          snapId: snap.id,
          caption: "should not save",
          idempotencyKey: `s3-insufficient-${snap.id}`,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SparkServiceError);
        assert.equal(error.code, "insufficient_sparks");
        return true;
      },
    );

    assert.equal(
      (await client.snap.findUnique({ where: { id: snap.id } }))?.caption,
      "original",
    );
    assert.equal((await getSparkBalance(userId)).total, 1);
    assert.equal(
      await client.sparkTransaction.count({
        where: { userId, type: "CAPTION_EDIT" },
      }),
      0,
    );
  },
);

test(
  "same caption is a no-op and does not spend Sparks",
  { skip: !hasDb ? "DATABASE_URL not set" : false },
  async () => {
    const { getSparkBalance } = await import("../lib/spark-service");
    const { updateSnapCaptionWithSparkAccounting } = await import(
      "../lib/snap-caption-service"
    );
    const client = await db();
    const userId = await createUser("s3-noop");
    const snap = await createSnap(userId, "same caption");
    await seedEarnedSparks(userId, 1);

    const result = await updateSnapCaptionWithSparkAccounting({
      userId,
      snapId: snap.id,
      caption: "same caption",
      idempotencyKey: `s3-noop-${snap.id}`,
    });

    assert.equal(result.noOp, true);
    assert.equal(result.sparkSpent, 0);
    assert.equal((await getSparkBalance(userId)).total, 1);
    assert.equal(
      await client.sparkTransaction.count({
        where: { userId, type: "CAPTION_EDIT" },
      }),
      0,
    );
  },
);

test(
  "stale balance is rejected by the server without a negative balance",
  { skip: !hasDb ? "DATABASE_URL not set" : false },
  async () => {
    const { SparkServiceError, getSparkBalance } = await import(
      "../lib/spark-service"
    );
    const { updateSnapCaptionWithSparkAccounting } = await import(
      "../lib/snap-caption-service"
    );
    const userId = await createUser("s3-stale");
    const snap = await createSnap(userId, "original");
    await seedEarnedSparks(userId, 2);

    // Another server-authoritative spend consumes the displayed balance first.
    const { spendSparks } = await import("../lib/spark-service");
    await spendSparks({
      userId,
      type: "CAPTION_EDIT",
      referenceId: `s3-stale-other-${snap.id}`,
    });

    await assert.rejects(
      () =>
        updateSnapCaptionWithSparkAccounting({
          userId,
          snapId: snap.id,
          caption: "stale should fail",
          idempotencyKey: `s3-stale-${snap.id}`,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SparkServiceError);
        assert.equal(error.code, "insufficient_sparks");
        return true;
      },
    );

    assert.equal((await getSparkBalance(userId)).total, 0);
  },
);

test(
  "retrying one logical caption edit does not charge twice",
  { skip: !hasDb ? "DATABASE_URL not set" : false },
  async () => {
    const { getSparkBalance } = await import("../lib/spark-service");
    const { updateSnapCaptionWithSparkAccounting } = await import(
      "../lib/snap-caption-service"
    );
    const client = await db();
    const userId = await createUser("s3-idempotent");
    const snap = await createSnap(userId, "before");
    await seedEarnedSparks(userId, 5);
    const idempotencyKey = `s3-idempotent-${snap.id}`;

    const first = await updateSnapCaptionWithSparkAccounting({
      userId,
      snapId: snap.id,
      caption: "after",
      idempotencyKey,
    });
    const second = await updateSnapCaptionWithSparkAccounting({
      userId,
      snapId: snap.id,
      caption: "after again",
      idempotencyKey,
    });

    assert.equal(first.sparkSpent, 2);
    assert.equal(second.idempotent, true);
    assert.equal(second.sparkSpent, 0);
    assert.equal(second.snap.caption, "after");
    assert.equal((await getSparkBalance(userId)).total, 3);
    assert.equal(
      await client.sparkTransaction.count({
        where: {
          userId,
          type: "CAPTION_EDIT",
          referenceId: idempotencyKey,
        },
      }),
      1,
    );
  },
);
