import { redirect, notFound } from "next/navigation";
import { getSession, isValidAdminUuid } from "@/lib/auth";

export default async function AdminSnapsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;

  if (!isValidAdminUuid(uuid)) {
    notFound();
  }

  const session = await getSession();

  if (!session || !session.authenticated || session.role !== "ADMIN") {
    redirect("/");
  }

  return children;
}
