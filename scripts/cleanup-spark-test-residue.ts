/**
 * One-off cleanup for the 2026-09-30 Spark test-residue incident.
 *
 * An interrupted `npm run test:spark` run left fixture users named
 * `spark_t_<label>_<runId>` (and their placeholder snaps pointing at
 * `https://res.cloudinary.com/test/image/upload/test.jpg`) in the shared
 * application database. Because `getRecentSnaps()` orders all snaps by
 * newest-first with no filter, those snaps occupied the Home "Recent Snaps"
 * strip (Web and Telegram alike) with broken test images.
 *
 * Scope guard: this script deletes ONLY users whose `name` starts with the
 * exact constant prefix below. The prefix is a compile-time constant — it
 * cannot be widened via CLI flags or environment variables, and the script
 * re-verifies the prefix against every user row immediately before deletion.
 * There is deliberately no unscoped `deleteMany({})` anywhere in this file.
 *
 * Behavior:
 *   (no flags)          → dry run: full read-only audit (candidates, snaps,
 *                         every referencing relation), deletes nothing.
 *   --apply             → re-runs the audit, then refuses unless ZERO
 *                         external references exist (any relation pointing at
 *                         a candidate user or candidate-owned snap from a
 *                         non-candidate row aborts the run). Deletion happens
 *                         in a single Prisma transaction, followed by
 *                         verification that no candidates or test snaps
 *                         remain.
 *
 * The script never deletes snaps owned by non-candidate users, never touches
 * Follow/Notification/social rows of real users, and never prints secrets.
 *
 * Database safety: this script deliberately binds the application
 * `DATABASE_URL` (via --env-file-if-exists=.env.local) because the residue
 * being removed lives in the shared application database — it is an
 * operational remediation tool, not a test suite, and deliberately does NOT
 * use scripts/test-db-guard.ts. Accidental damage is prevented by the exact
 * prefix lock (a database without `spark_t_*` users has zero candidates and
 * deletes nothing), the dry-run default, the external-reference gate, and
 * single-transaction deletion.
 *
 * Run:
 *   npx tsx --env-file-if-exists=.env.local scripts/cleanup-spark-test-residue.ts           # audit
 *   npx tsx --env-file-if-exists=.env.local scripts/cleanup-spark-test-residue.ts --apply   # delete
 */

import { PrismaClient } from "@prisma/client";

const TEST_USER_PREFIX = "spark_t_";

if (TEST_USER_PREFIX !== "spark_t_") {
  throw new Error("cleanup script: prefix constant was modified — refusing to run");
}

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

function prefixedUsersWhere() {
  return { name: { startsWith: TEST_USER_PREFIX } };
}

/** Every relation in prisma/schema.prisma that can point at a candidate user
 * or a candidate-owned snap from OUTSIDE the candidate set. Any non-zero
 * count here aborts `--apply`. */
async function auditExternalReferences() {
  const p = TEST_USER_PREFIX;
  return {
    // Social graph / messaging
    userFollows: await prisma.userFollow.count({ where: { OR: [{ follower: { name: { startsWith: p } } }, { following: { name: { startsWith: p } } }] } }),
    notificationsToCandidates: await prisma.notification.count({ where: { user: { name: { startsWith: p } } } }),
    notificationsFromCandidates: await prisma.notification.count({ where: { actor: { name: { startsWith: p } } } }),
    notificationsOnCandidateSnaps: await prisma.notification.count({ where: { snap: { user: { name: { startsWith: p } } } } }),
    commentsByCandidates: await prisma.comment.count({ where: { user: { name: { startsWith: p } } } }),
    commentsOnCandidateSnaps: await prisma.comment.count({ where: { snap: { user: { name: { startsWith: p } } } } }),
    reactionsByCandidates: await prisma.reaction.count({ where: { user: { name: { startsWith: p } } } }),
    reactionsOnCandidateSnaps: await prisma.reaction.count({ where: { snap: { user: { name: { startsWith: p } } } } }),
    commentLikesByCandidates: await prisma.commentLike.count({ where: { user: { name: { startsWith: p } } } }),
    messageReactionsByCandidates: await prisma.messageReaction.count({ where: { user: { name: { startsWith: p } } } }),
    conversationsWithCandidates: await prisma.conversation.count({ where: { OR: [{ userLow: { name: { startsWith: p } } }, { userHigh: { name: { startsWith: p } } }] } }),
    conversationParticipants: await prisma.conversationParticipant.count({ where: { user: { name: { startsWith: p } } } }),
    messagesFromCandidates: await prisma.message.count({ where: { sender: { name: { startsWith: p } } } }),
    // Profile / content references
    realUsersWithCandidateProfileImage: await prisma.user.count({ where: { profileImageSnap: { user: { name: { startsWith: p } } } } }),
    heroCarouselSlidesOnCandidateSnaps: await prisma.heroCarouselSlide.count({ where: { snap: { user: { name: { startsWith: p } } } } }),
    profilePhotoGalleryPayments: await prisma.profilePhotoGalleryPayment.count({ where: { user: { name: { startsWith: p } } } }),
    telegramAccounts: await prisma.telegramAccount.count({ where: { user: { name: { startsWith: p } } } }),
    pushSubscriptions: await prisma.pushSubscription.count({ where: { user: { name: { startsWith: p } } } }),
    subscriptions: await prisma.subscription.count({ where: { user: { name: { startsWith: p } } } }),
    subscriptionPurchases: await prisma.subscriptionPurchase.count({ where: { user: { name: { startsWith: p } } } }),
    // Cross-user snap relations (a candidate uploader on a real user's snap)
    snapsUploadedByCandidatesButOwnedByOthers: await prisma.snap.count({
      where: { uploadedBy: { name: { startsWith: p } }, user: { NOT: { name: { startsWith: p } } } },
    }),
  };
}

async function audit() {
  const users = await prisma.user.findMany({
    where: prefixedUsersWhere(),
    select: { id: true, name: true, createdAt: true, _count: { select: { snaps: true } } },
    orderBy: { name: "asc" },
  });
  const snapCount = await prisma.snap.count({ where: { user: { name: { startsWith: TEST_USER_PREFIX } } } });
  const fixtureUrlSnaps = await prisma.snap.count({
    where: { imageUrl: "https://res.cloudinary.com/test/image/upload/test.jpg", user: { name: { startsWith: TEST_USER_PREFIX } } },
  });
  const external = await auditExternalReferences();

  // Fixture labels group users by interrupted run (suffix = run-scoped id).
  const byLabel = new Map<string, number>();
  for (const u of users) {
    const match = u.name.match(/^(spark_t_.+)_[0-9a-z]+_[0-9a-z]+$/);
    const label = match ? `${match[1]} (run-scoped)` : "(no run suffix — pre-hygiene residue)";
    byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
  }

  return { users, snapCount, fixtureUrlSnaps, external, byLabel };
}

function printAudit({ users, snapCount, fixtureUrlSnaps, external, byLabel }: Awaited<ReturnType<typeof audit>>) {
  console.log("=== Spark test-residue audit ==============================");
  console.log(`candidate users (name startsWith "${TEST_USER_PREFIX}"): ${users.length}`);
  console.log(`candidate-owned snaps:                              ${snapCount}`);
  console.log(`  … using the test.jpg fixture URL:                 ${fixtureUrlSnaps}`);
  console.log("--- fixture labels (by interrupted run) ---");
  for (const [label, count] of [...byLabel.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)} × ${label}`);
  }
  console.log("--- sample candidates (first 10) ---");
  for (const u of users.slice(0, 10)) {
    console.log(`  ${u.name}  (snaps: ${u._count.snaps}, created ${u.createdAt.toISOString()})`);
  }
  if (users.length > 10) console.log(`  … and ${users.length - 10} more`);
  console.log("--- external references (must all be 0 to delete) ---");
  let externalTotal = 0;
  for (const [key, value] of Object.entries(external)) {
    externalTotal += value;
    console.log(`  ${String(value).padStart(4)}  ${key}`);
  }
  console.log("==========================================================");
  return externalTotal;
}

async function apply() {
  const { users, snapCount, external } = await audit();
  const externalTotal = Object.values(external).reduce((sum, n) => sum + n, 0);

  if (users.length === 0) {
    console.log("No candidate users found — nothing to clean up. Exiting without changes.");
    return;
  }

  if (externalTotal > 0) {
    console.error(`REFUSING TO DELETE: ${externalTotal} external reference(s) found.`);
    console.error("Candidate users are referenced by real application data. Review the");
    console.error("audit above, resolve those references, and re-run. No rows were deleted.");
    process.exitCode = 1;
    return;
  }

  // Belt and braces: re-verify the exact prefix against every row that is
  // about to be deleted (the prefix constant is the only authorized target).
  const invalid = users.filter((u) => !u.name.startsWith(TEST_USER_PREFIX));
  if (invalid.length > 0) {
    console.error(`REFUSING TO DELETE: ${invalid.length} candidate row(s) no longer match the "${TEST_USER_PREFIX}" prefix.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Deleting ${users.length} test users and their ${snapCount} snaps (single transaction)…`);
  // Child tables have no `name` column — filter through the `user` relation.
  const childRowsOfCandidates = { user: { name: { startsWith: TEST_USER_PREFIX } } } as const;
  const result = await prisma.$transaction([
    // Candidate-owned child rows first (their other FKs are all Cascade and
    // the external audit above guarantees no non-candidate row references
    // them; explicit order keeps the transaction deterministic).
    prisma.sparkTransaction.deleteMany({ where: childRowsOfCandidates }),
    prisma.dailyUploadCounter.deleteMany({ where: childRowsOfCandidates }),
    prisma.dailySparkEarnCounter.deleteMany({ where: childRowsOfCandidates }),
    prisma.dailyDownloadCounter.deleteMany({ where: childRowsOfCandidates }),
    prisma.snap.deleteMany({ where: { user: { name: { startsWith: TEST_USER_PREFIX } } } }),
    // User rows last — every remaining FK is Cascade or SetNull per schema.
    prisma.user.deleteMany({ where: prefixedUsersWhere() }),
  ]);
  const labels = ["sparkTransactions", "dailyUploadCounters", "dailySparkEarnCounters", "dailyDownloadCounters", "snaps", "users"];
  for (let i = 0; i < result.length; i++) {
    console.log(`  deleted ${result[i].count} ${labels[i]}`);
  }

  // Post-delete verification.
  const remainingUsers = await prisma.user.count({ where: prefixedUsersWhere() });
  const remainingSnaps = await prisma.snap.count({
    where: { imageUrl: "https://res.cloudinary.com/test/image/upload/test.jpg" },
  });
  if (remainingUsers !== 0 || remainingSnaps !== 0) {
    console.error(`VERIFICATION FAILED: ${remainingUsers} candidate user(s), ${remainingSnaps} test.jpg snap(s) remain.`);
    process.exitCode = 1;
    return;
  }
  console.log("Verified: 0 spark_t_* users and 0 test.jpg snaps remain.");
  console.log("Home Recent Snaps now draws from real user content only.");
}

async function main() {
  const auditResult = await audit();
  const externalTotal = printAudit(auditResult);

  if (!APPLY) {
    console.log("DRY RUN — nothing was deleted. Re-run with --apply to delete.");
    console.log(`External references: ${externalTotal} ${externalTotal === 0 ? "(deletion would be allowed)" : "(deletion is BLOCKED)"}`);
    return;
  }
  await apply();
}

main()
  .catch((error) => {
    console.error("Cleanup failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
