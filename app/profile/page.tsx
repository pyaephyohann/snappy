import { redirect } from "next/navigation";
import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import ProfileLogoutButton from "@/components/profile/ProfileLogoutButton";
import TelegramDisconnectButton from "@/components/profile/TelegramDisconnectButton";
import { getLinkedAccountByUserId } from "@/lib/telegram/account";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { resolveProfileImageUrl } from "@/lib/user-profile";
import { formatAdminDate } from "@/lib/admin-types";

export default async function ProfilePage() {
  const user = await getAuthenticatedAppUser();
  if (!user) {
    redirect("/");
  }

  const profileImage = resolveProfileImageUrl(
    user.profileImage,
    user.profileImageSnap?.imageUrl,
  );
  const telegramLink = await getLinkedAccountByUserId(user.id);

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={user.name} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-6 text-xl font-semibold text-foreground sm:text-2xl">
          Profile
        </h1>

        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card px-6 py-8 text-center shadow-sm">
          <div className="relative mx-auto h-28 w-28 overflow-hidden rounded-full bg-muted ring-2 ring-border">
            <Image
              src={profileImage}
              alt={`${user.name}'s profile`}
              fill
              className="object-cover"
              sizes="112px"
              priority
            />
          </div>
          <h2 className="mt-5 text-2xl font-semibold text-foreground">
            {user.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Snappy member since {formatAdminDate(user.createdAt)}
          </p>

          <dl className="mt-8 space-y-4 border-t border-border pt-6 text-left text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Last sign-in</dt>
              <dd className="font-medium text-foreground">
                {user.lastLoginAt
                  ? formatAdminDate(user.lastLoginAt)
                  : "Just now"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Account</dt>
              <dd className="font-medium text-foreground">Active</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Telegram</dt>
              <dd className="font-medium text-foreground">
                {telegramLink
                  ? telegramLink.telegramUsername
                    ? `@${telegramLink.telegramUsername}`
                    : "Connected"
                  : "Not connected"}
              </dd>
            </div>
          </dl>

          {telegramLink ? (
            <div className="mt-6 border-t border-border pt-6">
              <TelegramDisconnectButton />
            </div>
          ) : null}

          <div className="mt-8 flex justify-center">
            <ProfileLogoutButton />
          </div>
        </div>
      </main>
    </div>
  );
}
