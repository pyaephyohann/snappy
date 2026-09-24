import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/auth";
import Navbar from "@/components/layout/Navbar";
import FriendsSearchClient from "@/components/search/FriendsSearchClient";
import { getCurrentUserProfileImage } from "@/lib/user-profile";
import { listUsersForViewerPage } from "@/lib/relationships";

export default async function SearchPage() {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    redirect("/");
  }

  const [friendsPage, profileImage] = await Promise.all([
    listUsersForViewerPage({ viewerId: user.id }),
    getCurrentUserProfileImage(user.id),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={user.name} profileImage={profileImage} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-4 text-xl font-semibold text-foreground sm:text-2xl">
          Search
        </h1>
        <FriendsSearchClient
          friends={friendsPage.users}
          nextCursor={friendsPage.nextCursor}
        />
      </main>
    </div>
  );
}
