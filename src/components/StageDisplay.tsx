import { formatTicket } from '@/lib/utils'
import type { DrawEvent, DrawStatus } from '@/types'

type StageDisplayProps = {
  orgName: string
  brandImageDataUrl: string | null
  remaining: number
  stopAt: number
  totalTickets: number
  lastDrawn: DrawEvent | null
  flashKey: number
  status: DrawStatus
  digits: number
  insuredRemaining: number
}

export function StageDisplay({
  orgName,
  brandImageDataUrl,
  remaining,
  stopAt,
  totalTickets,
  lastDrawn,
  flashKey,
  status,
  digits,
  insuredRemaining,
}: StageDisplayProps) {
  const outcome = lastDrawn?.outcome
  const isReturned = outcome === 'returned'
  const isEliminated = outcome === 'eliminated'
  const finished = status === 'finished'

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="absolute inset-0">
        {brandImageDataUrl ? (
          <img
            src={brandImageDataUrl}
            alt=""
            className="h-full w-full object-cover opacity-45 stage-brand-drift"
          />
        ) : (
          <div className="h-full w-full stage-fallback-grid" aria-hidden />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,10,0.55)_0%,rgba(8,12,10,0.82)_48%,rgba(8,12,10,0.95)_100%)]" />
        <div className="absolute inset-0 stage-vignette" />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-6 pb-6 pt-5 sm:px-10 sm:pt-7">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display text-[clamp(2rem,5vw,3.75rem)] leading-none tracking-[0.04em] text-[var(--ink)] stage-brand-in">
              {orgName}
            </p>
            <p className="mt-2 max-w-xl text-sm text-[var(--ink-muted)] sm:text-base">
              Ticket draw-down · live on stage
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              Status
            </p>
            <p className="mt-1 font-display text-lg tracking-wide text-[var(--accent)]">
              {finished ? 'COMPLETE' : status === 'running' ? 'DRAWING' : status === 'paused' ? 'PAUSED' : 'READY'}
            </p>
          </div>
        </header>

        <div className="mt-6 grid flex-1 grid-rows-[auto_1fr_auto] gap-6">
          <div className="grid grid-cols-3 gap-3 sm:gap-5">
            <Stat label="Remaining" value={String(remaining)} emphasize />
            <Stat label="Stop at" value={String(stopAt)} />
            <Stat label="Insured left" value={String(insuredRemaining)} />
          </div>

          <div className="relative flex items-center justify-center">
            <div
              key={flashKey}
              className={`ticket-reveal relative flex min-h-[220px] w-full max-w-3xl flex-col items-center justify-center px-4 ${
                isReturned ? 'ticket-reveal--return' : isEliminated ? 'ticket-reveal--out' : ''
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--ink-faint)]">
                {finished
                  ? remaining <= stopAt
                    ? 'Final remaining'
                    : 'Draw complete'
                  : lastDrawn
                    ? 'Last drawn'
                    : 'Awaiting first draw'}
              </p>
              <p
                className={`font-display mt-3 text-[clamp(5rem,18vw,11rem)] leading-none tracking-[0.02em] ${
                  isReturned
                    ? 'text-[var(--safe)]'
                    : isEliminated
                      ? 'text-[var(--ink)]'
                      : 'text-[var(--ink)]'
                }`}
              >
                {lastDrawn ? formatTicket(lastDrawn.ticket, digits) : '—'}
              </p>
              <p className="mt-4 min-h-7 text-center text-sm font-semibold uppercase tracking-[0.18em] sm:text-base">
                {lastDrawn ? (
                  isReturned ? (
                    <span className="text-[var(--safe)]">Insured · returned to pool</span>
                  ) : (
                    <span className="text-[var(--danger)]">Eliminated</span>
                  )
                ) : (
                  <span className="text-[var(--ink-muted)]">
                    Pool of {totalTickets} · pace controlled by operator
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-end justify-between gap-4 border-t border-[var(--line)] pt-4">
            <p className="text-xs text-[var(--ink-faint)] sm:text-sm">
              Draw Down · local event software
            </p>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[var(--panel-elevated)] sm:w-56">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700 ease-out"
                style={{
                  width: `${Math.max(0, Math.min(100, ((totalTickets - remaining) / Math.max(totalTickets - stopAt, 1)) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  emphasize = false,
}: {
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div className="border border-[var(--line)] bg-[rgba(12,18,16,0.55)] px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)] sm:text-xs">
        {label}
      </p>
      <p
        className={`font-display mt-1 text-[clamp(1.6rem,4vw,2.75rem)] leading-none tracking-wide ${
          emphasize ? 'text-[var(--accent)]' : 'text-[var(--ink)]'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
