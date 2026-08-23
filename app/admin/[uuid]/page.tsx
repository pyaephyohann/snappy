import { redirect, notFound } from "next/navigation";
import { getSession, isValidAdminUuid } from "@/lib/auth";
import DashboardPageClient from "@/components/admin/DashboardPageClient";

export default async function AdminDashboardPage({
  params,
}: {
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

  return <DashboardPageClient username={session.username} uuid={uuid} />;
}
