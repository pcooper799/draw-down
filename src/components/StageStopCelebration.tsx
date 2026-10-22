import { formatTicket } from '@/lib/utils'
import type { DrawEvent, Ticket } from '@/types'

type Props = {
  orgName: string
  brandImageDataUrl: string | null
  pool: Ticket[]
  lastDrawn: DrawEvent | null
  digits: number
  stopAt: number
}

/** Audience / projection stop overlay — celebration only, no continue controls. */
export function StageStopCelebration({
  orgName,
  brandImageDataUrl,
  pool,
  lastDrawn,
  digits,
  stopAt,
}: Props) {
  const remainingCount = pool.length
  const lastTicket = lastDrawn?.ticket ?? null
  const wasReturned = lastDrawn?.outcome === 'returned'
  const wasOut = lastDrawn?.outcome === 'eliminated'
  const hasMoreTickets = remainingCount > 1

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="finish-dialog w-[min(94vw,640px)] overflow-hidden border border-[var(--accent)]/35 bg-[var(--panel)] shadow-2xl">
        <div className="finish-dialog-banner px-6 pb-4 pt-6">
          {brandImageDataUrl && (
            <img
              src={brandImageDataUrl}
              alt=""
              className="finish-brand-pop mx-auto mb-4 max-h-28 w-auto object-contain"
            />
          )}
          <div className="text-center">
            <p className="font-display text-3xl tracking-wide text-[var(--accent)] sm:text-4xl">
              {hasMoreTickets ? 'Stop reached' : 'Draw complete'}
            </p>
            <p className="mt-2 text-base text-[var(--ink-muted)]">
              {orgName}
              {hasMoreTickets ? ' · prize break' : ' · last ticket drawn'}
            </p>
          </div>
        </div>

        <div className="space-y-5 px-6 pb-6 pt-2">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ink-faint)]">
              Last drawn
            </p>
            {lastTicket != null ? (
              <>
                <p
                  className={`finish-winner-number font-display mt-3 text-[clamp(3.5rem,14vw,6.5rem)] leading-none tracking-wide ${
                    wasReturned
                      ? 'text-[var(--safe)]'
                      : wasOut
                        ? 'text-[var(--danger)]'
                        : 'text-[var(--accent)]'
                  }`}
                >
                  {formatTicket(lastTicket, digits)}
                </p>
                <p className="mt-3 text-sm font-semibold uppercase tracking-[0.16em]">
                  {wasReturned ? (
                    <span className="text-[var(--safe)]">Returned · insurance used</span>
                  ) : wasOut ? (
                    <span className="text-[var(--danger)]">Out</span>
                  ) : (
                    <span className="text-[var(--ink-muted)]">Drawn</span>
                  )}
                </p>
              </>
            ) : (
              <p className="mt-3 font-display text-4xl text-[var(--ink-muted)]">—</p>
            )}
          </div>

          <p className="text-center text-sm text-[var(--ink-muted)]">
            {remainingCount} ticket{remainingCount === 1 ? '' : 's'} still in the draw
            {hasMoreTickets ? ` · stopped at ${stopAt}` : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
