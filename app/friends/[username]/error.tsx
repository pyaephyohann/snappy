'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { GlowButton } from '@/components/ui/glow-button';
import { GlowLink } from '@/components/ui/glow-link';

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
      {/* Simple Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/home"
              className="text-xl sm:text-2xl lg:text-3xl font-bold text-primary hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring rounded px-2 py-1"
            >
              Snappy
            </Link>
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
          <div className="text-5xl sm:text-6xl mb-4">⚠️</div>
          <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-4">
            Something went wrong
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base mb-6 sm:mb-8">
            We encountered an error while loading this friend&apos;s snaps.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <GlowButton
              onClick={reset}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Try Again
            </GlowButton>
            <GlowLink
              href="/home"
              className="px-6 py-3 border border-border rounded-lg hover:bg-muted transition-colors bg-card"
            >
              Back to Friends
            </GlowLink>
          </div>
        </div>
      </main>
    </div>
  );
}
