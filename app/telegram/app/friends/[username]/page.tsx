import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FriendProfileClient from "@/components/friends/FriendProfileClient";

export default async function TelegramMiniAppFriendPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/telegram/app");

  const { username } = await params;
  const friend = await prisma.user.findFirst({
    where: { name: decodeURIComponent(username) },
    select: {
      id: true,
      name: true,
      profileImage: true,
      createdAt: true,
      snaps: {
        select: {
          id: true,
          imageUrl: true,
          caption: true,
          createdAt: true,
          uploadedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!friend) notFound();

  return (
    <div className="px-4 pb-6 pt-4">
      <FriendProfileClient friend={friend} />
    </div>
  );
}
