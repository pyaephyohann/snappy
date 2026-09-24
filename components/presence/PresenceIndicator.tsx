import { formatLastSeen } from "@/lib/presence";

/** Accessible, screen-reader-safe presence text. Never color-only. */
export function presenceLabel(
  isOnline: boolean,
  lastSeenAt: string | null = null,
): string {
  if (isOnline) return "Online";
  return formatLastSeen(lastSeenAt) ?? "Offline";
}

export default function PresenceIndicator({
  isOnline,
  lastSeenAt = null,
  withLabel = false,
  className = "",
}: {
  isOnline: boolean;
  lastSeenAt?: string | null;
  withLabel?: boolean;
  className?: string;
}) {
  const label = presenceLabel(isOnline, lastSeenAt);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        aria-hidden="true"
        className={
          isOnline
            ? "h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500"
            : "h-2.5 w-2.5 shrink-0 rounded-full border border-muted-foreground/50"
        }
      />
      {withLabel ? (
        <span
          className={
            isOnline
              ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
              : "text-xs text-muted-foreground"
          }
        >
          {label}
        </span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
