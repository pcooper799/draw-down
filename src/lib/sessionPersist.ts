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
  history: DrawEvent[]
  lastDrawn: DrawEvent | null
  /** Running sessions restore as paused so the operator can resume safely. */
  status: Exclude<DrawStatus, 'running'>
}

export type LiveSessionSlice = {
  config: SessionConfig
  insuranceMarks: Set<number>
  eliminated: number[]
  history: DrawEvent[]
  lastDrawn: DrawEvent | null
  status: DrawStatus
}

export function buildPoolFromSnapshot(
  totalTickets: number,
  eliminated: number[],
  insuranceMarks: Set<number>,
): Ticket[] {
  const out = new Set(eliminated)
  return Array.from({ length: totalTickets }, (_, i) => {
    const number = i + 1
    return {
      number,
      insured: !out.has(number) && insuranceMarks.has(number),
    }
  }).filter((t) => !out.has(t.number))
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
    history: live.history.slice(0, 50),
    lastDrawn: live.lastDrawn,
    status,
  }
}

export function parseSnapshot(raw: unknown): SessionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<SessionSnapshot>
  if (data.version !== SNAPSHOT_VERSION) return null
  if (!data.config || typeof data.config !== 'object') return null

  const config: SessionConfig = {
    ...DEFAULT_CONFIG,
    ...data.config,
    totalTickets: Math.max(1, Number(data.config.totalTickets) || DEFAULT_CONFIG.totalTickets),
    stopAt: Math.max(1, Number(data.config.stopAt) || DEFAULT_CONFIG.stopAt),
    paceMs: Math.max(200, Number(data.config.paceMs) || DEFAULT_CONFIG.paceMs),
    orgName: String(data.config.orgName || DEFAULT_CONFIG.orgName),
    brandImageDataUrl:
      typeof data.config.brandImageDataUrl === 'string' || data.config.brandImageDataUrl === null
        ? data.config.brandImageDataUrl
        : null,
  }

  const insuranceMarks = Array.isArray(data.insuranceMarks)
    ? data.insuranceMarks.filter((n): n is number => Number.isFinite(n) && n >= 1)
    : []
  const eliminated = Array.isArray(data.eliminated)
    ? data.eliminated.filter((n): n is number => Number.isFinite(n) && n >= 1)
    : []

  const status: SessionSnapshot['status'] =
    data.status === 'finished' || data.status === 'paused' || data.status === 'idle'
      ? data.status
      : 'paused'

  return {
    version: SNAPSHOT_VERSION,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date().toISOString(),
    config,
    insuranceMarks,
    eliminated,
    history: Array.isArray(data.history) ? (data.history as DrawEvent[]) : [],
    lastDrawn: data.lastDrawn ?? null,
    status,
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
