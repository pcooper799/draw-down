import { useMemo } from 'react'
import { formatTicket } from '@/lib/utils'
import type { Ticket } from '@/types'

export type TicketBoardState = 'insured' | 'active' | 'out'

type TicketBoardProps = {
  totalTickets: number
  pool: Ticket[]
  digits: number
  lastDrawnTicket: number | null
}

export function ticketState(
  number: number,
  inPool: Map<number, Ticket>,
): TicketBoardState {
  const ticket = inPool.get(number)
  if (!ticket) return 'out'
  return ticket.insured ? 'insured' : 'active'
}

export function TicketBoard({
  totalTickets,
  pool,
  digits,
  lastDrawnTicket,
}: TicketBoardProps) {
  const inPool = useMemo(() => {
    const map = new Map<number, Ticket>()
    for (const t of pool) map.set(t.number, t)
    return map
  }, [pool])

  const numbers = useMemo(
    () => Array.from({ length: totalTickets }, (_, i) => i + 1),
    [totalTickets],
  )

  // Dense but projection-readable: ~2.4–3.2rem cells; scroll when needed
  const minCell = totalTickets > 300 ? '2.15rem' : totalTickets > 120 ? '2.4rem' : '2.75rem'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Ticket board · {totalTickets}
        </p>
        <Legend />
      </div>

      <div className="ticket-board-scroll min-h-0 flex-1 overflow-auto p-2.5 sm:p-3.5">
        <div
          className="ticket-board-grid"
          style={{ ['--ticket-min' as string]: minCell }}
          role="list"
          aria-label="All ticket numbers"
        >
          {numbers.map((n) => {
            const state = ticketState(n, inPool)
            const isLast = lastDrawnTicket === n
            return (
              <div
                key={n}
                role="listitem"
                data-state={state}
                data-last={isLast ? 'true' : undefined}
                className={`ticket-cell ticket-cell--${state}${isLast ? ' ticket-cell--last' : ''}`}
                title={
                  state === 'insured'
                    ? `#${n} insured · in pool`
                    : state === 'active'
                      ? `#${n} in draw · no insurance`
                      : `#${n} eliminated`
                }
              >
                {formatTicket(n, digits)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm" aria-label="Ticket color legend">
      <li className="flex items-center gap-1.5 text-[var(--safe)]">
        <span className="legend-swatch legend-swatch--insured" aria-hidden />
        Insured
      </li>
      <li className="flex items-center gap-1.5 text-[var(--warn)]">
        <span className="legend-swatch legend-swatch--active" aria-hidden />
        In draw
      </li>
      <li className="flex items-center gap-1.5 text-[var(--danger)]">
        <span className="legend-swatch legend-swatch--out" aria-hidden />
        Out
      </li>
    </ul>
  )
}
