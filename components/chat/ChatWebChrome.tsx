"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import BottomNav from "@/components/mobile/BottomNav";
import NotificationSync from "@/components/notifications/NotificationSync";

export default function ChatWebChrome({
  username,
  profileImage,
  children,
}: {
  username: string;
  profileImage: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isConversation = pathname !== "/chats" && pathname.startsWith("/chats/");
  return (
    <div className="user-app-shell min-h-full bg-background">
      <NotificationSync />
      <Navbar username={username} profileImage={profileImage} />
      <div className={isConversation ? "" : "user-app-content-pad"}>{children}</div>
      {!isConversation ? <BottomNav username={username} /> : null}
    </div>
  );
}
