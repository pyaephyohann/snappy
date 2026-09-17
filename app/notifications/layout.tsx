import UserAppChrome from "@/components/layout/UserAppChrome";
import NotificationSync from "@/components/notifications/NotificationSync";
import { getSession } from "@/lib/auth";

export default async function NotificationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <>
      {session ? (
        <div className="user-app-shell min-h-full">
          <UserAppChrome username={session.username}>{children}</UserAppChrome>
        </div>
      ) : (
        <div className="user-app-shell min-h-full">
          <NotificationSync />
          <div className="user-app-content-pad min-h-full">{children}</div>
        </div>
      )}
    </>
  );
}
