import {
  clampPaceMs,
  clampStopAt,
  clampTicketScale,
  clampTotalTickets,
  normalizePrizeTiers,
  normalizeTicketList,
  pruneInsuranceMarks,
} from '@/lib/drawRules'
import type { DrawEvent, DrawStatus, SessionConfig, Ticket } from '@/types'
import { DEFAULT_CONFIG } from '@/types'

export const AUTOSAVE_KEY = 'draw-down.session.v1'
export const SNAPSHOT_VERSION = 1 as const

export type SessionSnapshot = {
  version: typeof SNAPSHOT_VERSION
  savedAt: string
  config: SessionConfig
  insuranceMarks: number[]
  eliminated: number[]
  /** Temporarily removed for auction / re-entry; not permanently eliminated. */
  heldOut?: number[]
  /**
   * Tickets that were held before the first Start. After Start, only these may
   * be re-held (restore is always allowed). Optional for older snapshots.
   */
  preStartHeld?: number[]
  history: DrawEvent[]
  lastDrawn: DrawEvent | null
  /** Running sessions restore as paused so the operator can resume safely. */
  status: Exclude<DrawStatus, 'running'>
  /** Links this session to the offline audit package. */
  eventId?: string
}

export type LiveSessionSlice = {
  config: SessionConfig
  insuranceMarks: Set<number>
  eliminated: number[]
  heldOut: number[]
  preStartHeld?: number[]
  history: DrawEvent[]
  lastDrawn: DrawEvent | null
  status: DrawStatus
  eventId?: string
}

export function buildPoolFromSnapshot(
  totalTickets: number,
  eliminated: number[],
  insuranceMarks: Set<number>,
  heldOut: number[] = [],
): Ticket[] {
  const out = new Set(eliminated)
  const held = new Set(heldOut)
  return Array.from({ length: totalTickets }, (_, i) => {
    const number = i + 1
    return {
      number,
      insured: !out.has(number) && !held.has(number) && insuranceMarks.has(number),
    }
  }).filter((t) => !out.has(t.number) && !held.has(t.number))
}

export function toSnapshot(live: LiveSessionSlice): SessionSnapshot {
  const status: SessionSnapshot['status'] =
    live.status === 'running' ? 'paused' : live.status === 'finished' ? 'finished' : live.status === 'paused' ? 'paused' : 'idle'

  return {
    version: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    config: live.config,
    insuranceMarks: [...live.insuranceMarks].sort((a, b) => a - b),
    eliminated: [...live.eliminated],
    heldOut: [...live.heldOut],
    preStartHeld: [...(live.preStartHeld ?? [])].sort((a, b) => a - b),
    history: live.history.slice(0, 50),
    lastDrawn: live.lastDrawn,
    status,
    eventId: live.eventId,
  }
}

export function parseSnapshot(raw: unknown): SessionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<SessionSnapshot>
  if (data.version !== SNAPSHOT_VERSION) return null
  if (!data.config || typeof data.config !== 'object') return null

  const rawTotal = Number(data.config.totalTickets) || DEFAULT_CONFIG.totalTickets
  const rawStop = Number(data.config.stopAt) || DEFAULT_CONFIG.stopAt
  const totalTickets = clampTotalTickets(rawTotal, rawStop)
  const stopAt = clampStopAt(rawStop, totalTickets)

  const config: SessionConfig = {
    ...DEFAULT_CONFIG,
    ...data.config,
    totalTickets,
    stopAt,
    paceMs: clampPaceMs(Number(data.config.paceMs) || DEFAULT_CONFIG.paceMs),
    ticketScale: clampTicketScale(
      Number(data.config.ticketScale) || DEFAULT_CONFIG.ticketScale,
    ),
    prizeTiers: normalizePrizeTiers(
      Array.isArray(data.config.prizeTiers) ? data.config.prizeTiers : [stopAt],
      totalTickets,
    ),
    orgName: String(data.config.orgName || DEFAULT_CONFIG.orgName),
    brandImageDataUrl:
      typeof data.config.brandImageDataUrl === 'string' || data.config.brandImageDataUrl === null
        ? data.config.brandImageDataUrl
        : null,
  }

  const eliminatedRaw = Array.isArray(data.eliminated)
    ? data.eliminated.filter((n): n is number => Number.isFinite(n) && n >= 1 && n <= totalTickets)
    : []
  // Deduplicate while preserving first-seen order (most recent outs first in live play)
  const eliminated: number[] = []
  const seenOut = new Set<number>()
  for (const n of eliminatedRaw) {
    if (seenOut.has(n)) continue
    seenOut.add(n)
    eliminated.push(n)
  }

  const heldOut = normalizeTicketList(
    Array.isArray(data.heldOut) ? data.heldOut : [],
    totalTickets,
    eliminated,
  )

  const insuranceMarks = [
    ...pruneInsuranceMarks(
      Array.isArray(data.insuranceMarks)
        ? data.insuranceMarks.filter((n): n is number => Number.isFinite(n) && n >= 1)
        : [],
      totalTickets,
      eliminated,
    ),
  ].sort((a, b) => a - b)

  const status: SessionSnapshot['status'] =
    data.status === 'finished' || data.status === 'paused' || data.status === 'idle'
      ? data.status
      : 'paused'

  const started =
    status !== 'idle' ||
    eliminated.length > 0 ||
    (Array.isArray(data.history) && data.history.length > 0)

  const preStartHeld = normalizeTicketList(
    Array.isArray(data.preStartHeld)
      ? data.preStartHeld
      : // Older saves: if already mid-event, allow re-hold only for tickets held now.
        started
        ? heldOut
        : [],
    totalTickets,
    eliminated,
  )

  return {
    version: SNAPSHOT_VERSION,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date().toISOString(),
    config,
    insuranceMarks,
    eliminated,
    heldOut,
    preStartHeld,
    history: Array.isArray(data.history) ? (data.history as DrawEvent[]) : [],
    lastDrawn: data.lastDrawn ?? null,
    status,
    eventId: typeof data.eventId === 'string' ? data.eventId : undefined,
  }
}

export function readAutosave(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    return parseSnapshot(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writeAutosave(snapshot: SessionSnapshot) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot))
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY)
  } catch {
    // ignore
  }
}

export function downloadSnapshotFile(snapshot: SessionSnapshot) {
  const stamp = snapshot.savedAt.replace(/[:.]/g, '-').slice(0, 19)
  const name = `draw-down-${stamp}.json`
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export async function readSnapshotFromFile(file: File): Promise<SessionSnapshot | null> {
  const text = await file.text()
  try {
    return parseSnapshot(JSON.parse(text))
  } catch {
    return null
  }
}

export function formatSavedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
