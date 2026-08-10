import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-8 shadow-xl max-w-md w-full">
        <h1 className="text-2xl font-bold text-primary mb-4">Welcome, {session.username}!</h1>
        <p className="text-muted-foreground">
          You are now authenticated. The home page will be implemented in the next milestone.
        </p>
      </div>
    </div>
  );
}
