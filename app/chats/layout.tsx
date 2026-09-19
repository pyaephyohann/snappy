import { redirect } from "next/navigation";
import ChatWebChrome from "@/components/chat/ChatWebChrome";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { getCurrentUserProfileImage } from "@/lib/user-profile";

export default async function ChatsLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedAppUser();
  if (!user) redirect("/");
  const profileImage = await getCurrentUserProfileImage(user.id);
  return (
    <ChatWebChrome username={user.name} profileImage={profileImage}>
      {children}
    </ChatWebChrome>
  );
}
