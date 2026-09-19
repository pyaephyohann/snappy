import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/auth";
import HomeContent from "@/components/home/HomeContent";
import { getHomeDataForUser } from "@/lib/home-data";
import { triggerBirthdayNotifications } from "@/lib/birthday-notifications";

export default async function HomePage() {
  const user = await getAuthenticatedAppUser();

  if (!user) {
    redirect("/");
  }

  const homeData = await getHomeDataForUser(user.id);

  // Trigger birthday notifications (deduplicated — sends at most once per user per day)
  void triggerBirthdayNotifications();

  return (
    <HomeContent
      username={user.name}
      profileImage={homeData.profileImage}
      heroCarousel={homeData.heroCarousel}
      friends={homeData.friends}
      snaps={homeData.snaps}
    />
  );
}
