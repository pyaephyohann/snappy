import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FriendCard from "@/components/home/FriendCard";
import Navbar from "@/components/layout/Navbar";

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  // Fetch friend profiles from PostgreSQL
  const friends = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      profileImage: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <Navbar username={session.username} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Friends Section */}
        <section>
          <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-4 sm:mb-6">
            Your Friends
          </h2>

          {friends.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
              <p className="text-muted-foreground text-sm sm:text-base">
                No friends yet. Check back soon!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
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
