import UserAppChrome from "@/components/layout/UserAppChrome";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return (
    <div className="user-app-shell min-h-full">
      <UserAppChrome username={session.username}>{children}</UserAppChrome>
    </div>
  );
}
