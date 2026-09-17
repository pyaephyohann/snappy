import { Skeleton } from "@/components/ui/skeleton";

export default function RecentSnapsSkeleton() {
  return (
    <section className="mb-8 sm:mb-10" aria-busy="true" aria-label="Loading recent snaps">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex gap-3 overflow-hidden sm:gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="w-[7.5rem] shrink-0 sm:w-32">
            <Skeleton className="aspect-[3/4] w-full rounded-xl" />
            <Skeleton className="mx-auto mt-2 h-4 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}
