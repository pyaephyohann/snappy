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
      caption: "Morning coffee ☕",
    },
    {
      userId: createdUsers[0].id,
      imageUrl: "/anya.jpeg",
      caption: "Beautiful sunset",
    },
    {
      userId: createdUsers[0].id,
      imageUrl: "/anya.jpeg",
      caption: "Weekend hike",
    },
    {
      userId: createdUsers[0].id,
      imageUrl: "/anya.jpeg",
    },

    // Bob's snaps
    {
      userId: createdUsers[1].id,
      imageUrl: "/anya.jpeg",
      caption: "New guitar 🎸",
    },
    {
      userId: createdUsers[1].id,
      imageUrl: "/anya.jpeg",
      caption: "Beach day",
    },
    {
      userId: createdUsers[1].id,
      imageUrl: "/anya.jpeg",
    },

    // Charlie's snaps
    {
      userId: createdUsers[2].id,
      imageUrl: "/anya.jpeg",
      caption: "Cooking experiment",
    },
    {
      userId: createdUsers[2].id,
      imageUrl: "/anya.jpeg",
      caption: "City lights",
    },
    {
      userId: createdUsers[2].id,
      imageUrl: "/anya.jpeg",
      caption: "Road trip",
    },
    {
      userId: createdUsers[2].id,
      imageUrl: "/anya.jpeg",
    },

    // David's snaps
    {
      userId: createdUsers[3].id,
      imageUrl: "/anya.jpeg",
      caption: "Snow day ❄️",
    },
    {
      userId: createdUsers[3].id,
      imageUrl: "/anya.jpeg",
      caption: "Book lover",
    },
    {
      userId: createdUsers[3].id,
      imageUrl: "/anya.jpeg",
    },

    // Emma's snaps
    {
      userId: createdUsers[4].id,
      imageUrl: "/anya.jpeg",
      caption: "Garden bloom",
    },
    {
      userId: createdUsers[4].id,
      imageUrl: "/anya.jpeg",
      caption: "Art class",
    },
    {
      userId: createdUsers[4].id,
      imageUrl: "/anya.jpeg",
      caption: "Festival vibes",
    },
    {
      userId: createdUsers[4].id,
      imageUrl: "/anya.jpeg",
    },
    {
      userId: createdUsers[4].id,
      imageUrl: "/anya.jpeg",
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
