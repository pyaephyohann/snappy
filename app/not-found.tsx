import { GlowLink } from '@/components/ui/glow-link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
          Page Not Found
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base mb-8">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <GlowLink
          href="/"
          className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Go to Home
        </GlowLink>
      </div>
    </div>
  );
}
