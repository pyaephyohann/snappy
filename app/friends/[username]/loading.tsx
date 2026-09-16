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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Back Navigation Skeleton */}
        <div className="mb-4 sm:mb-6">
          <Skeleton className="h-4 w-24 sm:h-5 sm:w-32 bg-muted" />
        </div>

        {/* Friend Header Skeleton */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8 shadow-lg">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <Skeleton className="w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-full bg-muted" />
            <div className="flex-1 text-center sm:text-left">
              <Skeleton className="h-7 w-40 sm:h-8 sm:w-48 bg-muted mb-1 sm:mb-2" />
              <Skeleton className="h-4 w-20 sm:h-5 sm:w-24 bg-muted" />
            </div>
          </div>
        </div>

        {/* Snaps Grid Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
              <Skeleton className="aspect-square w-full bg-muted" />
              <div className="p-2 sm:p-4">
                <Skeleton className="h-3 w-full sm:h-4 bg-muted mb-1 sm:mb-2" />
                <Skeleton className="h-3 w-20 sm:h-3 sm:w-24 bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
