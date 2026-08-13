import { Skeleton } from "@/components/ui/skeleton";

export default function AdminSnapsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-32 rounded-xl" />
      <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-72 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
