'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Friend profile error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-primary">Snappy</h1>
            </div>
            <Link
              href="/home"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to Friends
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-semibold text-foreground mb-4">
            Something went wrong
          </h2>
          <p className="text-muted-foreground mb-8">
            We encountered an error while loading this friend&apos;s snaps.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={reset}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Try Again
            </button>
            <Link
              href="/home"
              className="px-6 py-3 border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Back to Friends
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
