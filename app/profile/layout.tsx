import UserAppChrome from "@/components/layout/UserAppChrome";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    redirect("/");
  }

  return (
    <div className="user-app-shell min-h-full">
      <UserAppChrome username={user.name}>{children}</UserAppChrome>
    </div>
  );
}
