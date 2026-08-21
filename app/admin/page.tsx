import { getAdminSession } from "@/lib/admin-auth";
import AdminAuthForm from "@/components/admin/AdminAuthForm";
import DashboardPageClient from "@/components/admin/DashboardPageClient";

export default async function AdminDashboardPage() {
  const adminSession = await getAdminSession();

  if (!adminSession) {
    return <AdminAuthForm />;
  }

  return <DashboardPageClient username="Admin" />;
}
