import { useMemo, type MouseEvent } from 'react'
import { canMarkTicketHeld, ticketCellRem } from '@/lib/drawRules'
import { formatTicket } from '@/lib/utils'
import type { Ticket } from '@/types'

export type TicketBoardState = 'insured' | 'active' | 'held' | 'out'

type TicketBoardProps = {
  totalTickets: number
  pool: Ticket[]
  heldOut: number[]
  digits: number
  lastDrawnTicket: number | null
  /** Cell size multiplier (1 = default). Persists with session. */
  ticketScale?: number
  /** Right-click: hold an in-pool ticket out, or bring a held ticket back. */
  onToggleHold?: (ticket: number) => void
  interactive?: boolean
  /** After Start, new holds are limited to the pre-start held set. */
  drawHasStarted?: boolean
  preStartHeld?: number[]
}

export function ticketState(
  number: number,
  inPool: Map<number, Ticket>,
  held: Set<number>,
): TicketBoardState {
  if (held.has(number)) return 'held'
  const ticket = inPool.get(number)
  if (!ticket) return 'out'
  return ticket.insured ? 'insured' : 'active'
}

export function TicketBoard({
  totalTickets,
  pool,
  heldOut,
  digits,
  lastDrawnTicket,
  ticketScale = 1,
  onToggleHold,
  interactive = Boolean(onToggleHold),
  drawHasStarted = false,
  preStartHeld = [],
}: TicketBoardProps) {
  const inPool = useMemo(() => {
    const map = new Map<number, Ticket>()
    for (const t of pool) map.set(t.number, t)
    return map
  }, [pool])

  const held = useMemo(() => new Set(heldOut), [heldOut])
  const preHeld = useMemo(() => new Set(preStartHeld), [preStartHeld])

  const numbers = useMemo(
    () => Array.from({ length: totalTickets }, (_, i) => i + 1),
    [totalTickets],
  )

  const minCell = ticketCellRem(totalTickets, ticketScale)

  const handleContextMenu = (event: MouseEvent, n: number, state: TicketBoardState) => {
    if (!onToggleHold) return
    if (state === 'out') return
    event.preventDefault()
    onToggleHold(n)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Ticket board · {totalTickets}
          {heldOut.length > 0 ? ` · ${heldOut.length} held` : ''}
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
            const state = ticketState(n, inPool, held)
            const isLast = lastDrawnTicket === n
            const holdGate = canMarkTicketHeld({
              ticket: n,
              drawHasStarted,
              preStartHeld: preHeld,
              currentlyHeld: state === 'held',
            })
            const canToggle =
              interactive &&
              state !== 'out' &&
              (state === 'held' || holdGate.ok)
            const title =
              state === 'out'
                ? `#${n} eliminated`
                : state === 'held'
                  ? `#${n} held out (auction) · right-click to bring back`
                  : !holdGate.ok
                    ? holdGate.reason
                    : state === 'insured'
                      ? `#${n} insured · right-click to hold out`
                      : `#${n} No-Insurance · right-click to hold out`
            return (
              <div
                key={n}
                role="listitem"
                data-state={state}
                data-last={isLast ? 'true' : undefined}
                className={`ticket-cell ticket-cell--${state}${isLast ? ' ticket-cell--last' : ''}${
                  canToggle ? ' ticket-cell--interactive' : ''
                }${
                  interactive && state !== 'out' && state !== 'held' && !holdGate.ok
                    ? ' ticket-cell--hold-locked'
                    : ''
                }`}
                title={title}
                onContextMenu={(event) => handleContextMenu(event, n, state)}
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
        No-Insurance
      </li>
      <li className="flex items-center gap-1.5 text-[var(--held)]">
        <span className="legend-swatch legend-swatch--held" aria-hidden />
        Held
      </li>
      <li className="flex items-center gap-1.5 text-[var(--danger)]">
        <span className="legend-swatch legend-swatch--out" aria-hidden />
        Out
      </li>
    </ul>
  )
}
