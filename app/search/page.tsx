import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/layout/Navbar";
import FriendsSearchClient from "@/components/search/FriendsSearchClient";
import { getCurrentUserProfileImage } from "@/lib/user-profile";

export default async function SearchPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const [friends, profileImage] = await Promise.all([
    prisma.user.findMany({
    select: {
      id: true,
      name: true,
      profileImage: true,
    },
    orderBy: { name: "asc" },
    }),
    session.userId ? getCurrentUserProfileImage(session.userId) : "/anya.jpeg",
  ]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={session.username} profileImage={profileImage} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-4 text-xl font-semibold text-foreground sm:text-2xl">
          Search
        </h1>
        <FriendsSearchClient friends={friends} />
      </main>
    </div>
  );
}
