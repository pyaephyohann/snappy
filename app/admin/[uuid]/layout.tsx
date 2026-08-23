import { redirect, notFound } from "next/navigation";
import { getSession, isValidAdminUuid } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";
import { ToastProvider } from "@/components/admin/ToastProvider";

export default async function AdminUuidLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;

  // Validate UUID matches the secret
  if (!isValidAdminUuid(uuid)) {
    notFound();
  }

  const session = await getSession();

  // Require admin session
  if (!session || !session.authenticated || session.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <ToastProvider>
      <AdminShell username={session.username} uuid={uuid}>
        {children}
      </AdminShell>
    </ToastProvider>
  );
}
