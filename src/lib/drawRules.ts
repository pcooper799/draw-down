/** Shared gameplay limits and helpers used by the session hook and UI. */

export const MIN_TICKETS = 1
export const MAX_TICKETS = 2500
export const MIN_STOP_AT = 1
export const MIN_PACE_MS = 200
export const MAX_PACE_MS = 60_000

export function clampTotalTickets(total: number, stopAt = MIN_STOP_AT) {
  const safeStop = Math.max(MIN_STOP_AT, stopAt)
  if (!Number.isFinite(total)) return Math.max(safeStop, 1)
  return Math.min(MAX_TICKETS, Math.max(safeStop, Math.floor(total)))
}

export function clampStopAt(stopAt: number, totalTickets: number) {
  const total = clampTotalTickets(totalTickets, MIN_STOP_AT)
  if (!Number.isFinite(stopAt)) return MIN_STOP_AT
  return Math.min(total, Math.max(MIN_STOP_AT, Math.floor(stopAt)))
}

export function clampPaceMs(paceMs: number) {
  if (!Number.isFinite(paceMs)) return 2500
  return Math.min(MAX_PACE_MS, Math.max(MIN_PACE_MS, Math.round(paceMs)))
}

/** True when a ticket number can still receive insurance (still in the pool). */
export function canInsureTicket(
  ticket: number,
  totalTickets: number,
  eliminated: Iterable<number>,
) {
  if (!Number.isFinite(ticket)) return false
  const n = Math.floor(ticket)
  if (n < 1 || n > totalTickets) return false
  const out = eliminated instanceof Set ? eliminated : new Set(eliminated)
  return !out.has(n)
}

export function pruneInsuranceMarks(
  marks: Iterable<number>,
  totalTickets: number,
  eliminated: Iterable<number>,
) {
  const out = eliminated instanceof Set ? eliminated : new Set(eliminated)
  const next = new Set<number>()
  for (const n of marks) {
    if (Number.isFinite(n) && n >= 1 && n <= totalTickets && !out.has(n)) {
      next.add(n)
    }
  }
  return next
}

/** Session has event progress — do not hard-kick for license expiry. */
export function hasLiveEventProgress(input: {
  status: string
  eliminatedCount: number
  historyCount: number
}) {
  return (
    input.status === 'running' ||
    input.status === 'paused' ||
    input.eliminatedCount > 0 ||
    input.historyCount > 0
  )
}
