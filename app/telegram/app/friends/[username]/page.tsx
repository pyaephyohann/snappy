import { notFound, redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FriendProfileClient from "@/components/friends/FriendProfileClient";
import { getRelationshipState } from "@/lib/relationships";

export default async function TelegramMiniAppFriendPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const user = await getAuthenticatedAppUser();
  if (!user) redirect("/telegram/app");

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

  const relationship =
    friend.id === user.id
      ? undefined
      : await getRelationshipState(user.id, friend.id);

  return (
    <div className="px-4 pb-6 pt-4">
      <FriendProfileClient friend={friend} relationship={relationship} />
    </div>
  );
}
