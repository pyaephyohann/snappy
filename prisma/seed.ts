import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Default passcode for all credentials.
 * In production, override via the DEFAULT_PASSCODE env var.
 */
const DEFAULT_PASSCODE = "welcometosnappy123";

async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  const resetMode = process.argv.includes("--reset");

  console.log("🌱 Starting seed...");
  console.log(`   Mode: ${resetMode ? "RESET (full wipe)" : "safe (idempotent)"}`);
  console.log(`   Environment: ${isProduction ? "production" : "development"}`);

  const passcodeToUse = process.env.DEFAULT_PASSCODE || DEFAULT_PASSCODE;
  const passcodeHash = await bcrypt.hash(passcodeToUse, 10);

  // ── Reset mode: wipe all data first ─────────────────────────────
  if (resetMode) {
    console.log("\n🧹 Resetting database — deleting all data...");

    // Delete in order respecting foreign key constraints
    await prisma.commentLike.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.reaction.deleteMany();
    await prisma.snap.deleteMany();
    await prisma.user.deleteMany();
    await prisma.accessCredential.deleteMany();
    await prisma.adminCredential.deleteMany();

    console.log("✅ All data deleted");
  }

  // ── Seed AccessCredential (user login) ───────────────────────────
  const existingCredential = await prisma.accessCredential.findFirst();

  if (!existingCredential) {
    await prisma.accessCredential.create({
      data: { passcodeHash },
    });
    console.log("\n✅ Created access credential (user login)");
    if (!isProduction) {
      console.log(`   Passcode: ${passcodeToUse}`);
    }
  } else if (resetMode) {
    // In reset mode, always recreate
    await prisma.accessCredential.update({
      where: { id: existingCredential.id },
      data: { passcodeHash },
    });
    console.log("\n✅ Updated access credential (user login)");
    if (!isProduction) {
      console.log(`   Passcode: ${passcodeToUse}`);
    }
  } else {
    console.log("\n⏭️  Access credential already exists, skipping");
  }

  // ── Seed AdminCredential ────────────────────────────────────────
  const existingAdminCredential = await prisma.adminCredential.findFirst();

  if (!existingAdminCredential) {
    await prisma.adminCredential.create({
      data: { passcodeHash },
    });
    console.log("✅ Created admin credential");
    if (!isProduction) {
      console.log(`   Passcode: ${passcodeToUse}`);
    }
  } else if (resetMode) {
    await prisma.adminCredential.update({
      where: { id: existingAdminCredential.id },
      data: { passcodeHash },
    });
    console.log("✅ Updated admin credential");
    if (!isProduction) {
      console.log(`   Passcode: ${passcodeToUse}`);
    }
  } else {
    console.log("⏭️  Admin credential already exists, skipping");
  }

  // ── Seed Users (development only) ───────────────────────────────
  if (!isProduction) {
    const users = [
      { name: "Ikki", profileImage: "/anya.jpeg", role: "ADMIN" as const },
      { name: "Alice", profileImage: "/anya.jpeg", role: "USER" as const },
      { name: "Bob", profileImage: "/anya.jpeg", role: "USER" as const },
      { name: "Charlie", profileImage: "/anya.jpeg", role: "USER" as const },
      { name: "David", profileImage: "/anya.jpeg", role: "USER" as const },
      { name: "Emma", profileImage: "/anya.jpeg", role: "USER" as const },
    ];

    console.log("\n👤 Seeding users...");

    const createdUsers = [];
    for (const userData of users) {
      const existing = await prisma.user.findFirst({
        where: { name: userData.name },
      });

      if (!existing) {
        const user = await prisma.user.create({ data: userData });
        createdUsers.push(user);
        console.log(`   ✅ ${user.name} (${user.role})`);
      } else {
        if (userData.role === "ADMIN" && existing.role !== "ADMIN") {
          const updated = await prisma.user.update({
            where: { id: existing.id },
            data: { role: "ADMIN" },
          });
          createdUsers.push(updated);
          console.log(`   ✅ ${updated.name} → promoted to ADMIN`);
        } else {
          createdUsers.push(existing);
          console.log(`   ⏭️  ${existing.name} already exists`);
        }
      }
    }

    // ── Seed Snaps (development only) ─────────────────────────────
    if (resetMode || (await prisma.snap.count()) === 0) {
      console.log("\n📸 Seeding snaps...");

      const snapData = [
        // Alice's snaps
        { userId: createdUsers[0].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-alice-1", caption: "Morning coffee ☕" },
        { userId: createdUsers[0].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-alice-2", caption: "Beautiful sunset" },
        { userId: createdUsers[0].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-alice-3", caption: "Weekend hike" },
        { userId: createdUsers[0].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-alice-4" },
        // Bob's snaps
        { userId: createdUsers[1].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-bob-1", caption: "New guitar 🎸" },
        { userId: createdUsers[1].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-bob-2", caption: "Beach day" },
        { userId: createdUsers[1].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-bob-3" },
        // Charlie's snaps
        { userId: createdUsers[2].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-charlie-1", caption: "Cooking experiment" },
        { userId: createdUsers[2].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-charlie-2", caption: "City lights" },
        { userId: createdUsers[2].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-charlie-3", caption: "Road trip" },
        { userId: createdUsers[2].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-charlie-4" },
        // David's snaps
        { userId: createdUsers[3].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-david-1", caption: "Snow day ❄️" },
        { userId: createdUsers[3].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-david-2", caption: "Book lover" },
        { userId: createdUsers[3].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-david-3" },
        // Emma's snaps
        { userId: createdUsers[4].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-emma-1", caption: "Garden bloom" },
        { userId: createdUsers[4].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-emma-2", caption: "Art class" },
        { userId: createdUsers[4].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-emma-3", caption: "Festival vibes" },
        { userId: createdUsers[4].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-emma-4", caption: "Starry night" },
        { userId: createdUsers[4].id, imageUrl: "/anya.jpeg", publicId: "legacy-snap-emma-5", caption: "Starry night" },
      ];

      let snapsCreated = 0;
      for (const snap of snapData) {
        const existing = await prisma.snap.findFirst({
          where: { publicId: snap.publicId },
        });
        if (!existing) {
          await prisma.snap.create({ data: snap });
          snapsCreated++;
        }
      }
      console.log(`   ✅ Created ${snapsCreated} snaps`);
    }
  } else {
    console.log("\n⏭️  Skipping sample users and snaps in production");
  }

  console.log("\n🌱 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
