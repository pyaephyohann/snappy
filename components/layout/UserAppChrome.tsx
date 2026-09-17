"use client";

import BottomNav from "@/components/mobile/BottomNav";
import NotificationSync from "@/components/notifications/NotificationSync";

interface UserAppChromeProps {
  username: string;
  children: React.ReactNode;
}

/**
 * Mobile bottom navigation + content inset for the authenticated user app.
 * Hidden on lg+ where the top navbar remains the primary chrome.
 */
export default function UserAppChrome({
  username,
  children,
}: UserAppChromeProps) {
  return (
    <>
      <NotificationSync />
      <div className="user-app-content-pad min-h-full">{children}</div>
      <BottomNav username={username} />
    </>
  );
}
