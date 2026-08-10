import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';

export default async function NotFound() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <Navbar username={session.username} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
          <div className="text-5xl sm:text-6xl mb-4">🔍</div>
          <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-4">
            Oops! We couldn&apos;t find this friend&apos;s snaps.
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base mb-6 sm:mb-8">
            The friend you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <Link
            href="/home"
            className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Back to Friends
          </Link>
        </div>
      </main>
    </div>
  );
}
