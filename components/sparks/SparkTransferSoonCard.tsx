/**
 * Transfer Sparks — Soon (UI-only placeholder).
 *
 * Announces a future Spark transfer feature on the shared profile surface.
 * This card is intentionally static: no hooks, no handlers, no links, no
 * fetches — there is no transfer action, recipient, route, or backend in
 * this milestone, so no Spark can ever move from here. The total shown on
 * the card above comes exclusively from the server and is never read or
 * altered by this component.
 *
 * The "Soon" badge follows the existing BottomNav convention (uppercase,
 * primary text, bordered pill).
 */
export default function SparkTransferSoonCard() {
  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      aria-label="Transfer Sparks, coming soon"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Transfer Sparks
        </h3>
        <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary">
          Soon
        </span>
      </div>

      {/* Non-interactive by design: a plain paragraph, not a button or link —
          nothing here opens a flow or initiates a transfer. */}
      <p className="mt-2 text-sm text-muted-foreground">
        Sending Sparks to friends is coming soon. For now Sparks stay in your
        account — nothing can be transferred yet.
      </p>
    </section>
  );
}
