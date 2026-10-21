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

function toSet(values: Iterable<number>) {
  return values instanceof Set ? values : new Set(values)
}

/** True when a ticket number can still receive insurance (still in the draw pool). */
export function canInsureTicket(
  ticket: number,
  totalTickets: number,
  eliminated: Iterable<number>,
  heldOut: Iterable<number> = [],
) {
  if (!Number.isFinite(ticket)) return false
  const n = Math.floor(ticket)
  if (n < 1 || n > totalTickets) return false
  const out = toSet(eliminated)
  const held = toSet(heldOut)
  return !out.has(n) && !held.has(n)
}

export function pruneInsuranceMarks(
  marks: Iterable<number>,
  totalTickets: number,
  eliminated: Iterable<number>,
) {
  const out = toSet(eliminated)
  const next = new Set<number>()
  for (const n of marks) {
    // Keep marks for held-out tickets so auction restores keep insurance.
    if (Number.isFinite(n) && n >= 1 && n <= totalTickets && !out.has(n)) {
      next.add(n)
    }
  }
  return next
}

export function normalizeTicketList(
  values: Iterable<number>,
  totalTickets: number,
  exclude: Iterable<number> = [],
) {
  const blocked = toSet(exclude)
  const next: number[] = []
  const seen = new Set<number>()
  for (const raw of values) {
    if (!Number.isFinite(raw)) continue
    const n = Math.floor(raw)
    if (n < 1 || n > totalTickets || blocked.has(n) || seen.has(n)) continue
    seen.add(n)
    next.push(n)
  }
  return next
}

/** Session has event progress — do not hard-kick for license expiry. */
export function hasLiveEventProgress(input: {
  status: string
  eliminatedCount: number
  historyCount: number
  heldOutCount?: number
}) {
  return (
    input.status === 'running' ||
    input.status === 'paused' ||
    input.eliminatedCount > 0 ||
    input.historyCount > 0 ||
    (input.heldOutCount ?? 0) > 0
  )
}
