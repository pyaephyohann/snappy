import { Skeleton } from "@/components/ui/skeleton";

export default function AdminSnapsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48 rounded-xl" />
      <Skeleton className="h-12 w-full max-w-xl rounded-xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
