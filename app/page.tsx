import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AuthForm from "@/components/auth/AuthForm";

export default async function Home() {
  const session = await getSession();

  if (session) {
    redirect("/home");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <AuthForm />
    </div>
  );
}
