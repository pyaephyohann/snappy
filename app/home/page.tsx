import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import FriendCard from '@/components/home/FriendCard';

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  // Fetch friend profiles from PostgreSQL
  const friends = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      profileImage: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-primary">Snappy</h1>
              <p className="text-muted-foreground mt-1">
                Hey, {session.username} 👋
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Friends Section */}
        <section>
          <h2 className="text-2xl font-semibold text-foreground mb-6">Your Friends</h2>
          
          {friends.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <p className="text-muted-foreground">No friends yet. Check back soon!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {friends.map((friend) => (
                <FriendCard
                  key={friend.id}
                  name={friend.name}
                  profileImage={friend.profileImage}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
