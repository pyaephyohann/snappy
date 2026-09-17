import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Navbar from "@/components/layout/Navbar";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={session.username} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-2 text-xl font-semibold text-foreground sm:text-2xl">
          Profile
        </h1>
        <div className="mt-8 rounded-xl border border-border bg-card px-6 py-12 text-center sm:py-16">
          <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Soon
          </span>
          <p className="mt-4 text-base font-medium text-foreground">
            Your profile is on the way
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            We&apos;re building a space for your Snappy identity. Check back
            here soon.
          </p>
        </div>
      </main>
    </div>
  );
}
