import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/auth";
import Navbar from "@/components/layout/Navbar";
import FriendCard from "@/components/home/FriendCard";
import GlowingBorder from "@/components/ui/glowing-border";
import { getCurrentUserProfileImage } from "@/lib/user-profile";
import { listFriendsForUser } from "@/lib/relationships";

/** The Friends page shows at most this many friends in one page. */
export const FRIENDS_PAGE_LIMIT = 50;

export const metadata = {
  title: "Friends | Snappy",
};

export default async function FriendsPage() {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    redirect("/");
  }

  const [friendsPage, profileImage] = await Promise.all([
    listFriendsForUser({ viewerId: user.id, limit: FRIENDS_PAGE_LIMIT }),
    getCurrentUserProfileImage(user.id),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={user.name} profileImage={profileImage} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
            Friends
          </h1>
          <Link
            href="/search"
            className="shrink-0 cursor-pointer text-sm font-medium text-primary hover:opacity-90"
          >
            Find friends →
          </Link>
        </div>

        {friendsPage.users.length === 0 ? (
          <GlowingBorder radius="xl">
            <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
              <div className="text-5xl sm:text-6xl mb-4" aria-hidden>
                👥
              </div>
              <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-2">
                No friends yet
              </h2>
              <p className="mx-auto max-w-md text-sm sm:text-base text-muted-foreground mb-6">
                You are friends with someone once you follow each other. Find
                people to follow and wait for them to follow back.
              </p>
              <Link
                href="/search"
                className="inline-block rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Find friends
              </Link>
            </div>
          </GlowingBorder>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
            {friendsPage.users.map((friend) => (
              <FriendCard
                key={friend.id}
                name={friend.name}
                profileImage={friend.profileImage}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
