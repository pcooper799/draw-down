import {
  countCommittedDraws,
  durableAheadOfLocal,
  reconstructFromDurableBlob,
  type ReconstructedEvent,
} from '@/lib/audit/reconstructSession'
import { listDurableAudits, type LocalAuditBlob } from '@/lib/audit/persist'
import { readAutosave, SNAPSHOT_VERSION, type SessionSnapshot } from '@/lib/sessionPersist'
import { DEFAULT_CONFIG } from '@/types'

export type RecoveryCandidate = {
  eventId: string
  mtimeMs: number
  blob: LocalAuditBlob
  reconstructed: ReconstructedEvent
  reason: string
}

const DISMISS_KEY = 'draw-down.recovery.dismissed.v1'

function readDismissed(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as Record<string, string>
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

export function markRecoveryDismissed(eventId: string) {
  const all = readDismissed()
  all[eventId] = new Date().toISOString()
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

export function clearRecoveryDismissed(eventId: string) {
  const all = readDismissed()
  delete all[eventId]
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

function localDrawProgress(session: SessionSnapshot | null) {
  if (!session) return { draws: 0, eliminated: 0, status: null as string | null, eventId: null as string | null }
  // history length approximates recent draws; eliminated is authoritative for outs
  return {
    draws: Array.isArray(session.history) ? session.history.length : 0,
    eliminated: Array.isArray(session.eliminated) ? session.eliminated.length : 0,
    status: session.status,
    eventId: session.eventId ?? null,
  }
}

/**
 * Find interrupted durable events that are ahead of (or missing from) localStorage.
 * Operator-only: stage must not drive recovery.
 */
export async function discoverRecoveryCandidates(): Promise<RecoveryCandidate[]> {
  if (typeof window === 'undefined') return []
  if (!window.drawDown?.auditList) return []

  const dismissed = readDismissed()
  const local = readAutosave()
  const localProg = localDrawProgress(local)
  const items = await listDurableAudits()
  const out: RecoveryCandidate[] = []

  for (const item of items) {
    if (dismissed[item.eventId]) continue
    const durableDraws = countCommittedDraws(item.blob.package)
    if (durableDraws <= 0) {
      // Still consider hold-only / mid-setup progress via reconstruct when possible
    }
    const reconstructed = reconstructFromDurableBlob(item.blob, local?.config)
    if (!reconstructed.ok) {
      // Surface corrupt/invalid durable audits so the operator can archive them.
      if (durableDraws > 0) {
        const total = item.blob.package.startingTickets || DEFAULT_CONFIG.totalTickets
        out.push({
          eventId: item.eventId,
          mtimeMs: item.mtimeMs,
          blob: item.blob,
          reconstructed: {
            ok: true,
            snapshot: {
              version: SNAPSHOT_VERSION,
              savedAt: new Date().toISOString(),
              config: {
                ...DEFAULT_CONFIG,
                ...(local?.config ?? {}),
                totalTickets: total,
                orgName: item.blob.package.eventName || 'Unknown event',
              },
              insuranceMarks: [],
              eliminated: [],
              heldOut: [],
              preStartHeld: [],
              history: [],
              lastDrawn: null,
              status: 'paused',
              eventId: item.eventId,
            },
            verify: reconstructed.verify ?? {
              ok: false,
              checks: [
                {
                  id: 'format',
                  label: 'Package',
                  status: 'fail',
                  detail: reconstructed.reason,
                },
              ],
            },
            drawCount: durableDraws,
            remaining: total,
            lastCommittedTicket: null,
            lastCommittedAt: null,
            hasLocalSeed: Boolean(item.blob.localSeedHex),
            finalized: Boolean(item.blob.package.finalized),
          },
          reason: `Durable audit failed verification: ${reconstructed.reason}`,
        })
      }
      continue
    }
    if (reconstructed.finalized && reconstructed.drawCount === 0) continue
    // Skip empty setup-only audits with no progress
    if (
      reconstructed.drawCount === 0 &&
      reconstructed.snapshot.eliminated.length === 0 &&
      (reconstructed.snapshot.heldOut?.length ?? 0) === 0
    ) {
      continue
    }

    const sameEvent = localProg.eventId === item.eventId
    const ahead = durableAheadOfLocal({
      durableDraws,
      durableEliminated: reconstructed.snapshot.eliminated.length,
      localDraws: sameEvent ? Math.max(localProg.draws, localProg.eliminated) : 0,
      localEliminated: sameEvent ? localProg.eliminated : 0,
      localStatus: sameEvent ? localProg.status : 'idle',
      sameEvent,
    })

    // Also recover when localStorage session is missing entirely but durable has progress
    const missingLocal = !local && (durableDraws > 0 || reconstructed.snapshot.eliminated.length > 0)
    if (!ahead && !missingLocal) continue

    out.push({
      eventId: item.eventId,
      mtimeMs: item.mtimeMs,
      blob: item.blob,
      reconstructed,
      reason: missingLocal
        ? 'Local session missing; durable audit has committed draws'
        : 'Durable audit is ahead of localStorage session',
    })
  }

  return out
}
