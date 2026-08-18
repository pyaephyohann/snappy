import { getAdminSession } from "@/lib/admin-auth";
import AdminAuthForm from "@/components/admin/AdminAuthForm";
import DashboardPageClient from "@/components/admin/DashboardPageClient";

// TEMPORARY AUTHENTICATION BYPASS FOR DEBUGGING
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export default async function AdminDashboardPage() {
  const adminSession = await getAdminSession();

  // TEMPORARY: Skip authentication check if BYPASS_AUTH is enabled
  if (!adminSession && !BYPASS_AUTH) {
    return <AdminAuthForm />;
  }

  return <DashboardPageClient username="Admin" />;
}
