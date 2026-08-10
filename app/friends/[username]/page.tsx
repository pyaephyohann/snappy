import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';

export default async function FriendProfilePage({
  params,
}: {
  params: { username: string };
}) {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  const decodedUsername = decodeURIComponent(params.username);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-primary">Snappy</h1>
              <p className="text-muted-foreground mt-1">
                Hey, {session.username} 👋
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-4">
            {decodedUsername}&apos;s Snaps
          </h2>
          <p className="text-muted-foreground">
            This friend&apos;s snaps page will be implemented in the next milestone.
          </p>
          <Link
            href="/home"
            className="inline-block mt-6 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Go Back
          </Link>
        </div>
      </main>
    </div>
  );
}
