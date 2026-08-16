/**
 * Skeleton loading state for the Assistente AI page.
 *
 * Matches the post-load layout so the perceived layout shift on first load is
 * minimal. Order: header (title + actions) → hero grid [2fr_1fr] with the
 * conversational heart left (period pill → empty-state card → composer) and the
 * companion column right (period scheda → memoria/obiettivi card).
 */
export function AssistantPageSkeleton() {
  return (
    <div className="space-y-4 max-desktop:portrait:pb-20 animate-pulse">
      {/* Page header skeleton — label, title + action cluster */}
      <div className="space-y-2 border-b border-border pb-4">
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-48 rounded bg-muted" />
            <div className="h-4 w-72 max-w-full rounded bg-muted" />
          </div>
          <div className="hidden desktop:flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-muted" />
            <div className="h-9 w-9 rounded-md bg-muted" />
            <div className="h-9 w-9 rounded-md bg-muted" />
            <div className="h-9 w-44 rounded-md bg-muted" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[2fr_1fr]">
        {/* Left column: period pill strip + hero card + composer */}
        <div className="flex min-w-0 flex-col">
          <div className="mb-4 flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
            <div className="h-10 w-72 max-w-full rounded-full bg-muted" />
            <div className="h-9 w-40 rounded-md bg-muted" />
          </div>

          {/* Hero card (empty state / conversation) */}
          <div className="rounded-2xl border border-border bg-card p-[22px] space-y-4">
            <div className="h-6 w-64 max-w-full rounded bg-muted" />
            <div className="h-11 w-56 max-w-full rounded-full bg-muted" />
            <div className="flex flex-wrap gap-2">
              <div className="h-9 w-40 rounded-full bg-muted" />
              <div className="h-9 w-52 rounded-full bg-muted" />
              <div className="h-9 w-36 rounded-full bg-muted" />
            </div>
          </div>

          {/* Composer skeleton */}
          <div className="border-t border-border bg-background px-4 pt-3 pb-4">
            <div className="h-[44px] w-full rounded-xl bg-muted" />
          </div>
        </div>

        {/* Right column: period scheda → memoria/obiettivi */}
        <div className="hidden desktop:flex desktop:flex-col desktop:gap-4">
          {/* Period scheda */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="px-4 py-3 border-b border-border">
              <div className="h-3 w-32 rounded bg-muted" />
            </div>
            <div className="px-4 py-4 border-b border-border/50">
              <div className="h-3 w-24 rounded bg-muted mb-2" />
              <div className="h-9 w-40 rounded bg-muted" />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex justify-between px-4 py-2.5 border-b border-border/50 last:border-0">
                <div className="h-3 w-16 rounded bg-muted" />
                <div className="h-3 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>

          {/* Memoria e obiettivi card */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="px-4 py-3 border-b border-border">
              <div className="h-3 w-36 rounded bg-muted" />
            </div>
            {[0, 1].map((i) => (
              <div key={i} className="flex justify-between px-4 py-2.5 border-b border-border/50 last:border-0">
                <div className="h-3 w-40 rounded bg-muted" />
                <div className="h-3 w-14 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
