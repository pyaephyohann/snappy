import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // Seed AccessCredential
  const developmentPasscode = "snappy123";
  const passcodeHash = await bcrypt.hash(developmentPasscode, 10);

  const existingCredential = await prisma.accessCredential.findFirst();

  if (!existingCredential) {
    await prisma.accessCredential.create({
      data: {
        passcodeHash,
      },
    });
    console.log("✅ Created access credential");
    console.log(`   Development passcode: ${developmentPasscode}`);
  } else {
    console.log("⏭️  Access credential already exists, skipping");
  }

  // Seed Users
  const users = [
    {
      name: "Alice",
      profileImage: "/anya.jpeg",
    },
    {
      name: "Bob",
      profileImage: "/anya.jpeg",
    },
    {
      name: "Charlie",
      profileImage: "/anya.jpeg",
    },
    {
      name: "David",
      profileImage: "/anya.jpeg",
    },
    {
      name: "Emma",
      profileImage: "/anya.jpeg",
    },
  ];

  const createdUsers = [];

  for (const userData of users) {
    const existingUser = await prisma.user.findFirst({
      where: { name: userData.name },
    });

    if (!existingUser) {
      const user = await prisma.user.create({
        data: userData,
      });
      createdUsers.push(user);
      console.log(`✅ Created user: ${user.name}`);
    } else {
      createdUsers.push(existingUser);
      console.log(`⏭️  User already exists: ${existingUser.name}, skipping`);
    }
  }

  // Seed Snaps
  const snapData = [
    // Alice's snaps
    {
      userId: createdUsers[0].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-alice-1",
      caption: "Morning coffee ☕",
    },
    {
      userId: createdUsers[0].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-alice-2",
      caption: "Beautiful sunset",
    },
    {
      userId: createdUsers[0].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-alice-3",
      caption: "Weekend hike",
    },
    {
      userId: createdUsers[0].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-alice-4",
    },

    // Bob's snaps
    {
      userId: createdUsers[1].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-bob-1",
      caption: "New guitar 🎸",
    },
    {
      userId: createdUsers[1].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-bob-2",
      caption: "Beach day",
    },
    {
      userId: createdUsers[1].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-bob-3",
    },

    // Charlie's snaps
    {
      userId: createdUsers[2].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-charlie-1",
      caption: "Cooking experiment",
    },
    {
      userId: createdUsers[2].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-charlie-2",
      caption: "City lights",
    },
    {
      userId: createdUsers[2].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-charlie-3",
      caption: "Road trip",
    },
    {
      userId: createdUsers[2].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-charlie-4",
    },

    // David's snaps
    {
      userId: createdUsers[3].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-david-1",
      caption: "Snow day ❄️",
    },
    {
      userId: createdUsers[3].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-david-2",
      caption: "Book lover",
    },
    {
      userId: createdUsers[3].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-david-3",
    },

    // Emma's snaps
    {
      userId: createdUsers[4].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-emma-1",
      caption: "Garden bloom",
    },
    {
      userId: createdUsers[4].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-emma-2",
      caption: "Art class",
    },
    {
      userId: createdUsers[4].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-emma-3",
      caption: "Festival vibes",
    },
    {
      userId: createdUsers[4].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-emma-4",
      caption: "Starry night",
    },
    {
      userId: createdUsers[4].id,
      imageUrl: "/anya.jpeg",
      publicId: "legacy-snap-emma-5",
      caption: "Starry night",
    },
  ];

  let snapsCreated = 0;

  for (const snap of snapData) {
    const existingSnap = await prisma.snap.findFirst({
      where: { imageUrl: snap.imageUrl },
    });

    if (!existingSnap) {
      await prisma.snap.create({
        data: snap,
      });
      snapsCreated++;
    }
  }

  console.log(`✅ Created ${snapsCreated} snaps`);
  console.log("🌱 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
