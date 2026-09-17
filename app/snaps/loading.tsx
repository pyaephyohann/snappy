import { Skeleton } from "@/components/ui/skeleton";

export default function SnapsLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-4 py-4 sm:px-6">
        <Skeleton className="h-8 w-32" />
      </div>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Skeleton className="mb-6 h-8 w-24" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[3/4] w-full rounded-xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
