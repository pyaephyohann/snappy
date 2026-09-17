import { getSession } from "@/lib/auth";
import Navbar from "@/components/layout/Navbar";
import NotificationSettings from "@/components/notifications/NotificationSettings";
import NotificationsPageClient from "@/components/notifications/NotificationsPageClient";

export default async function NotificationsPage() {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={session?.username ?? "Snappy"} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-4 text-xl font-semibold text-foreground sm:text-2xl">
          Notifications
        </h1>
        <NotificationSettings />
        <NotificationsPageClient />
      </main>
    </div>
  );
}
