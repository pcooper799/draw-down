/** Shared gameplay limits and helpers used by the session hook and UI. */

export const MIN_TICKETS = 1
export const MAX_TICKETS = 2500
export const MIN_STOP_AT = 1
export const MIN_PACE_MS = 200
export const MAX_PACE_MS = 60_000
/** Ticket board cell scale (1 = default density). */
export const MIN_TICKET_SCALE = 0.7
export const MAX_TICKET_SCALE = 2.4
export const TICKET_SCALE_STEP = 0.1

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

export function clampTicketScale(scale: number) {
  if (!Number.isFinite(scale)) return 1
  const stepped = Math.round(scale / TICKET_SCALE_STEP) * TICKET_SCALE_STEP
  return Math.min(MAX_TICKET_SCALE, Math.max(MIN_TICKET_SCALE, Number(stepped.toFixed(1))))
}

export function nudgeTicketScale(scale: number, direction: 1 | -1) {
  return clampTicketScale(clampTicketScale(scale) + direction * TICKET_SCALE_STEP)
}

/** Base cell min size in rem before operator scale (dense boards stay readable). */
export function baseTicketCellRem(totalTickets: number) {
  if (totalTickets > 300) return 2.15
  if (totalTickets > 120) return 2.4
  return 2.75
}

export function ticketCellRem(totalTickets: number, scale: number) {
  const rem = baseTicketCellRem(totalTickets) * clampTicketScale(scale)
  return `${rem.toFixed(2)}rem`
}

/** Normalize prize stop tiers: unique, descending, within 1..totalTickets-? keep >= 1 and < total. */
export function normalizePrizeTiers(tiers: Iterable<number>, totalTickets: number) {
  const total = clampTotalTickets(totalTickets)
  const maxStop = Math.max(1, total - 0) // stop can equal 1..total; typically < total for a draw
  const cleaned = [...new Set(
    [...tiers]
      .filter((n) => Number.isFinite(n))
      .map((n) => Math.floor(n))
      .filter((n) => n >= MIN_STOP_AT && n <= maxStop),
  )].sort((a, b) => b - a)
  return cleaned.length > 0 ? cleaned : [MIN_STOP_AT]
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
