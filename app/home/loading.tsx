import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar Skeleton */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Section Header Skeleton */}
        <div className="mb-4 sm:mb-6">
          <Skeleton className="h-7 w-32 sm:h-8 sm:w-40 bg-muted" />
        </div>

        {/* Friends Grid Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-3 sm:p-6">
              <div className="flex flex-col items-center text-center">
                <Skeleton className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-muted mb-2 sm:mb-4" />
                <Skeleton className="h-4 w-20 sm:h-5 sm:w-24 bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
