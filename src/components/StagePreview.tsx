import { useMemo } from 'react'
import { ticketState } from '@/components/TicketBoard'
import { formatTicket } from '@/lib/utils'
import type { Ticket } from '@/types'

/** Compact live thumbnail of the stage ticket board for projector safety. */
export function StagePreview({
  totalTickets,
  pool,
  heldOut,
  digits,
  orgName,
  statusLabel,
}: {
  totalTickets: number
  pool: Ticket[]
  heldOut: number[]
  digits: number
  orgName: string
  statusLabel: string
}) {
  const inPool = useMemo(() => {
    const map = new Map<number, Ticket>()
    for (const t of pool) map.set(t.number, t)
    return map
  }, [pool])
  const held = useMemo(() => new Set(heldOut), [heldOut])
  const sample = useMemo(() => {
    const max = Math.min(totalTickets, 80)
    return Array.from({ length: max }, (_, i) => i + 1)
  }, [totalTickets])

  return (
    <div className="overflow-hidden border border-[var(--line)] bg-black/40">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-2 py-1.5">
        <p className="truncate font-display text-xs tracking-wide text-[var(--ink)]">{orgName}</p>
        <p className="shrink-0 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          {statusLabel}
        </p>
      </div>
      <div
        className="grid gap-0.5 p-1.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(1.1rem, 1fr))' }}
        aria-hidden
      >
        {sample.map((n) => {
          const state = ticketState(n, inPool, held)
          return (
            <div
              key={n}
              className={`ticket-cell ticket-cell--${state}`}
              style={{ minHeight: '1.1rem', fontSize: '0.45rem' }}
            >
              {formatTicket(n, digits)}
            </div>
          )
        })}
      </div>
      {totalTickets > sample.length && (
        <p className="px-2 pb-1.5 text-[0.65rem] text-[var(--ink-faint)]">
          Preview · first {sample.length} of {totalTickets}
        </p>
      )}
    </div>
  )
}
