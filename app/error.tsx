'use client';

import { useEffect } from 'react';
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
    // Log error for debugging (not shown to user)
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
          Something went wrong
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base mb-8">
          An unexpected error occurred. Please try again.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <GlowButton
            onClick={reset}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Try Again
          </GlowButton>
          <GlowLink
            href="/"
            className="px-6 py-3 border border-border rounded-lg hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring bg-card"
          >
            Go to Home
          </GlowLink>
        </div>
      </div>
    </div>
  );
}
