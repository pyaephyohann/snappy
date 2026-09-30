import RecentSnapsSkeleton from '@/components/home/RecentSnapsSkeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar Skeleton */}
      <header className="safe-area-pt border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-16 sm:h-7 sm:w-20 lg:h-8 lg:w-24 bg-muted" />
            <div className="flex items-center gap-3 sm:gap-4">
              <Skeleton className="h-4 w-16 sm:h-5 sm:w-20 bg-muted" />
              <Skeleton className="h-8 w-16 sm:h-9 sm:w-20 bg-muted rounded-lg" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <Skeleton className="mb-8 aspect-[16/9] w-full rounded-xl bg-muted sm:mb-10" />
        <RecentSnapsSkeleton />
      </main>
    </div>
  );
}
