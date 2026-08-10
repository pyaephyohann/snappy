import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting seed...');

  // Seed AccessCredential
  const developmentPasscode = 'snappy123';
  const passcodeHash = await bcrypt.hash(developmentPasscode, 10);

  const existingCredential = await prisma.accessCredential.findFirst();
  
  if (!existingCredential) {
    await prisma.accessCredential.create({
      data: {
        passcodeHash,
      },
    });
    console.log('✅ Created access credential');
    console.log(`   Development passcode: ${developmentPasscode}`);
  } else {
    console.log('⏭️  Access credential already exists, skipping');
  }

  // Seed Users
  const users = [
    {
      name: 'Alice',
      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
    },
    {
      name: 'Bob',
      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob',
    },
    {
      name: 'Charlie',
      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie',
    },
    {
      name: 'David',
      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David',
    },
    {
      name: 'Emma',
      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emma',
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
    { userId: createdUsers[0].id, imageUrl: 'https://picsum.photos/seed/alice1/400/300', caption: 'Morning coffee ☕' },
    { userId: createdUsers[0].id, imageUrl: 'https://picsum.photos/seed/alice2/400/300', caption: 'Beautiful sunset' },
    { userId: createdUsers[0].id, imageUrl: 'https://picsum.photos/seed/alice3/400/300', caption: 'Weekend hike' },
    { userId: createdUsers[0].id, imageUrl: 'https://picsum.photos/seed/alice4/400/300' },
    
    // Bob's snaps
    { userId: createdUsers[1].id, imageUrl: 'https://picsum.photos/seed/bob1/400/300', caption: 'New guitar 🎸' },
    { userId: createdUsers[1].id, imageUrl: 'https://picsum.photos/seed/bob2/400/300', caption: 'Beach day' },
    { userId: createdUsers[1].id, imageUrl: 'https://picsum.photos/seed/bob3/400/300' },
    
    // Charlie's snaps
    { userId: createdUsers[2].id, imageUrl: 'https://picsum.photos/seed/charlie1/400/300', caption: 'Cooking experiment' },
    { userId: createdUsers[2].id, imageUrl: 'https://picsum.photos/seed/charlie2/400/300', caption: 'City lights' },
    { userId: createdUsers[2].id, imageUrl: 'https://picsum.photos/seed/charlie3/400/300', caption: 'Road trip' },
    { userId: createdUsers[2].id, imageUrl: 'https://picsum.photos/seed/charlie4/400/300' },
    
    // David's snaps
    { userId: createdUsers[3].id, imageUrl: 'https://picsum.photos/seed/david1/400/300', caption: 'Snow day ❄️' },
    { userId: createdUsers[3].id, imageUrl: 'https://picsum.photos/seed/david2/400/300', caption: 'Book lover' },
    { userId: createdUsers[3].id, imageUrl: 'https://picsum.photos/seed/david3/400/300' },
    
    // Emma's snaps
    { userId: createdUsers[4].id, imageUrl: 'https://picsum.photos/seed/emma1/400/300', caption: 'Garden bloom' },
    { userId: createdUsers[4].id, imageUrl: 'https://picsum.photos/seed/emma2/400/300', caption: 'Art class' },
    { userId: createdUsers[4].id, imageUrl: 'https://picsum.photos/seed/emma3/400/300', caption: 'Festival vibes' },
    { userId: createdUsers[4].id, imageUrl: 'https://picsum.photos/seed/emma4/400/300' },
    { userId: createdUsers[4].id, imageUrl: 'https://picsum.photos/seed/emma5/400/300', caption: 'Starry night' },
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
  console.log('🌱 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
