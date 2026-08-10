import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function NotFound() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary">Snappy</h1>
              <p className="text-muted-foreground text-sm sm:text-base mt-1">
                Hey, {session.username} 👋
              </p>
            </div>
            <Link
              href="/home"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded px-2 py-1"
            >
              ← Back to Friends
            </Link>
          </div>
        </div>
      </header>

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
