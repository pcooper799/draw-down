import { CenterDrawFlash } from '@/components/CenterDrawFlash'
import { RecentDrawsStrip } from '@/components/RecentDrawsStrip'
import { TicketBoard } from '@/components/TicketBoard'
import { formatTicket } from '@/lib/utils'
import type { DrawEvent, DrawStatus, Ticket } from '@/types'

type StageDisplayProps = {
  orgName: string
  brandImageDataUrl: string | null
  remaining: number
  stopAt: number
  totalTickets: number
  lastDrawn: DrawEvent | null
  history: DrawEvent[]
  flashKey: number
  status: DrawStatus
  digits: number
  insuredRemaining: number
  pool: Ticket[]
  heldOut: number[]
  ticketScale?: number
  onToggleHold?: (ticket: number) => void
}

export function StageDisplay({
  orgName,
  brandImageDataUrl,
  remaining,
  stopAt,
  totalTickets,
  lastDrawn,
  history,
  flashKey,
  status,
  digits,
  insuredRemaining,
  pool,
  heldOut,
  ticketScale = 1,
  onToggleHold,
}: StageDisplayProps) {
  const outcome = lastDrawn?.outcome
  const isReturned = outcome === 'returned'
  const isEliminated = outcome === 'eliminated'
  const finished = status === 'finished'

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="absolute inset-0">
        {brandImageDataUrl ? (
          <>
            <img
              src={brandImageDataUrl}
              alt=""
              className="h-full w-full object-cover opacity-[0.22] stage-brand-drift"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,10,0.45)_0%,rgba(8,12,10,0.82)_55%,rgba(8,12,10,0.94)_100%)]" />
          </>
        ) : (
          <>
            <div className="h-full w-full stage-fallback-grid" aria-hidden />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,10,0.35)_0%,rgba(8,12,10,0.85)_100%)]" />
          </>
        )}
        <div className="absolute inset-0 stage-vignette" />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4 sm:px-8 sm:pt-6">
        <header className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            {brandImageDataUrl ? (
              <div className="brand-mark shrink-0">
                <img
                  src={brandImageDataUrl}
                  alt={`${orgName} logo`}
                  className="brand-mark-img"
                />
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="font-display text-[clamp(2rem,4.5vw,3.4rem)] leading-none tracking-[0.03em] text-[var(--ink)] stage-brand-in">
                {orgName}
              </p>
              <p className="mt-2 text-sm tracking-wide text-[var(--ink-muted)]">
                Ticket draw-down · live on stage
              </p>
            </div>
          </div>
          <div className="status-pill shrink-0 px-3 py-2 text-right">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--ink-faint)]">
              Status
            </p>
            <p className="mt-0.5 font-display text-lg tracking-wide text-[var(--accent)]">
              {finished ? 'COMPLETE' : status === 'running' ? 'DRAWING' : status === 'paused' ? 'PAUSED' : 'READY'}
            </p>
          </div>
        </header>

        <div className="mt-5 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-3 sm:gap-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Stat label="Remaining" value={String(remaining)} emphasize />
            <Stat label="Stop at" value={String(stopAt)} />
            <Stat label="Insured left" value={String(insuredRemaining)} />
          </div>

          <div
            key={flashKey}
            className={`ticket-reveal last-drawn-panel flex min-w-[8rem] flex-col items-center justify-center px-4 py-3 sm:min-w-[10rem] ${
              isReturned ? 'ticket-reveal--return' : isEliminated ? 'ticket-reveal--out' : ''
            }`}
          >
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              Last drawn
            </p>
            <p
              className={`font-display mt-0.5 text-[clamp(2rem,5vw,3.25rem)] leading-none ${
                isReturned ? 'text-[var(--safe)]' : isEliminated ? 'text-[var(--danger)]' : 'text-[var(--ink)]'
              }`}
            >
              {lastDrawn ? formatTicket(lastDrawn.ticket, digits) : '—'}
            </p>
            <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em]">
              {lastDrawn ? (
                isReturned ? (
                  <span className="text-[var(--safe)]">Returned · used</span>
                ) : (
                  <span className="text-[var(--danger)]">Out</span>
                )
              ) : (
                <span className="text-[var(--ink-faint)]">Waiting</span>
              )}
            </p>
          </div>
        </div>

        <div className="mt-3 shrink-0">
          <RecentDrawsStrip history={history} digits={digits} />
        </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <TicketBoard
            totalTickets={totalTickets}
            pool={pool}
            heldOut={heldOut}
            digits={digits}
            ticketScale={ticketScale}
            lastDrawnTicket={lastDrawn?.ticket ?? null}
            onToggleHold={onToggleHold}
          />
        </div>

        <div className="mt-3 flex shrink-0 items-end justify-between gap-4 border-t border-[var(--line)] pt-3">
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

      <CenterDrawFlash lastDrawn={lastDrawn} flashKey={flashKey} digits={digits} />
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
    <div className="stat-tile px-3 py-2.5 sm:px-3.5 sm:py-3">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)] sm:text-xs">
        {label}
      </p>
      <p
        className={`font-display mt-1 text-[clamp(1.45rem,3.4vw,2.4rem)] leading-none tracking-wide ${
          emphasize ? 'text-[var(--accent)]' : 'text-[var(--ink)]'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
