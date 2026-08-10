import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-9 w-24 bg-muted" />
              <Skeleton className="h-5 w-48 bg-muted mt-2" />
            </div>
            <Skeleton className="h-5 w-32 bg-muted" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Friend Header Skeleton */}
        <div className="bg-card border border-border rounded-2xl p-8 mb-8 shadow-lg">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Skeleton className="w-32 h-32 rounded-full bg-muted" />
            <div className="flex-1 text-center sm:text-left">
              <Skeleton className="h-8 w-48 bg-muted mb-2" />
              <Skeleton className="h-5 w-24 bg-muted" />
            </div>
          </div>
        </div>

        {/* Snaps Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
              <Skeleton className="aspect-square w-full bg-muted" />
              <div className="p-4">
                <Skeleton className="h-4 w-full bg-muted mb-2" />
                <Skeleton className="h-3 w-24 bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
