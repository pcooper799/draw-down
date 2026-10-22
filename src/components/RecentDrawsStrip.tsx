import { formatTicket } from '@/lib/utils'
import type { DrawEvent } from '@/types'

/** Compact last-five strip for the stage / projection audience. */
export function RecentDrawsStrip({
  history,
  digits,
}: {
  history: DrawEvent[]
  digits: number
}) {
  const recent = history.slice(0, 5)

  return (
    <div className="recent-draws shrink-0" aria-label="Recently drawn tickets">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Recently drawn
        </p>
        <p className="text-[0.65rem] text-[var(--ink-faint)]">Newest → left</p>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {recent.length === 0 ? (
          <li className="recent-draws-empty text-sm text-[var(--ink-faint)]">
            Waiting for the first draw…
          </li>
        ) : (
          recent.map((event, index) => {
            const saved = event.outcome === 'returned'
            return (
              <li
                key={event.id}
                className={`recent-draws-chip recent-draws-chip--${saved ? 'saved' : 'out'}${
                  index === 0 ? ' recent-draws-chip--latest' : ''
                }`}
              >
                <span className="font-display text-[clamp(1.15rem,2.4vw,1.65rem)] leading-none tracking-wide">
                  {formatTicket(event.ticket, digits)}
                </span>
                <span className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.14em]">
                  {saved ? 'Saved · insurance' : 'Out'}
                </span>
              </li>
            )
          })
        )}
        {recent.length > 0 &&
          Array.from({ length: Math.max(0, 5 - recent.length) }, (_, i) => (
            <li key={`slot-${i}`} className="recent-draws-chip recent-draws-chip--empty" aria-hidden>
              <span className="font-display text-lg leading-none text-[var(--ink-faint)]">—</span>
            </li>
          ))}
      </ul>
    </div>
  )
}
