import { getAdminSession } from "@/lib/admin-auth";
import AdminShell from "@/components/admin/AdminShell";
import { ToastProvider } from "@/components/admin/ToastProvider";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminSession = await getAdminSession();

  return (
    <ToastProvider>
      {adminSession ? (
        <AdminShell username="Admin">{children}</AdminShell>
      ) : (
        children
      )}
    </ToastProvider>
  );
}
