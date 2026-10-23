/**
 * Rebuild a SessionSnapshot from a durable audit blob (crash recovery).
 * Audit entries are the source of truth for draws/holds/insurance/stops.
 */
import { verifyAuditPackage, type VerifyReport } from '@/lib/audit/verify'
import type { AuditEntry, AuditPackage } from '@/lib/audit/types'
import type { LocalAuditBlob, RecoveryAttachment } from '@/lib/audit/persist'
import {
  clampPaceMs,
  clampStopAt,
  clampTicketScale,
  clampTotalTickets,
  normalizePrizeTiers,
  normalizeTicketList,
} from '@/lib/drawRules'
import { normalizeOrgTheme } from '@/lib/orgTheme'
import type { SessionSnapshot } from '@/lib/sessionPersist'
import { SNAPSHOT_VERSION } from '@/lib/sessionPersist'
import type { DrawEvent, SessionConfig } from '@/types'
import { DEFAULT_CONFIG } from '@/types'

export type ReconstructedEvent = {
  ok: true
  snapshot: SessionSnapshot
  verify: VerifyReport
  drawCount: number
  remaining: number
  lastCommittedTicket: number | null
  lastCommittedAt: string | null
  hasLocalSeed: boolean
  finalized: boolean
}

export type ReconstructFailure = {
  ok: false
  reason: string
  verify?: VerifyReport
}

function isLocalAuditBlob(raw: unknown): raw is LocalAuditBlob {
  if (!raw || typeof raw !== 'object') return false
  const pkg = (raw as LocalAuditBlob).package
  return Boolean(pkg && typeof pkg === 'object' && pkg.format === 'draw-down-audit-v1')
}

/** Derive live ticket sets by replaying audit entries in order. */
export function replayTicketState(entries: AuditEntry[], startingTickets: number) {
  const eliminated: number[] = []
  const eliminatedSet = new Set<number>()
  const held = new Set<number>()
  const insured = new Set<number>()
  const heldBeforeStart = new Set<number>()
  let seenStart = false
  let stopAt = 1
  let paceMs = DEFAULT_CONFIG.paceMs
  let orgName = DEFAULT_CONFIG.orgName
  const history: DrawEvent[] = []
  let lastDrawn: DrawEvent | null = null

  for (const e of entries) {
    if (e.type === 'event_created') {
      const d = e.details ?? {}
      if (typeof d.stopAt === 'number') stopAt = d.stopAt
      if (typeof d.paceMs === 'number') paceMs = d.paceMs
      if (typeof d.orgName === 'string' && d.orgName.trim()) orgName = d.orgName.trim()
    }
    if (e.type === 'config_changed' && e.details) {
      if (typeof e.details.next === 'string' && e.details.next.trim()) {
        orgName = e.details.next.trim()
      }
      if (typeof e.details.paceMs === 'number') paceMs = e.details.paceMs
      if (typeof e.details.stopAt === 'number') stopAt = e.details.stopAt
    }
    if ((e.type === 'stop_at_changed' || e.type === 'continue') && e.stopAt != null) {
      stopAt = e.stopAt
    }
    if (e.type === 'insurance_marked' && e.ticket != null) insured.add(e.ticket)
    if (e.type === 'insurance_cleared' && e.ticket != null) insured.delete(e.ticket)
    if (e.type === 'hold' && e.ticket != null) {
      held.add(e.ticket)
      if (!seenStart) heldBeforeStart.add(e.ticket)
    }
    if (e.type === 'release' && e.ticket != null) {
      held.delete(e.ticket)
      // pre-start permission set freezes at first Start — do not remove from heldBeforeStart
    }
    if (e.type === 'start') {
      // Freeze permission set as currently held at first Start
      if (!seenStart) {
        heldBeforeStart.clear()
        for (const n of held) heldBeforeStart.add(n)
        seenStart = true
      }
      if (e.stopAt != null) stopAt = e.stopAt
    }
    if (e.type === 'resume' && e.stopAt != null) stopAt = e.stopAt
    if (e.type === 'stop_reached' && e.stopAt != null) stopAt = e.stopAt

    if (e.type === 'draw_selection' && e.ticket != null) {
      const ticket = e.ticket
      if (e.permanentlyEliminated) {
        if (!eliminatedSet.has(ticket)) {
          eliminatedSet.add(ticket)
          eliminated.unshift(ticket)
        }
        insured.delete(ticket)
        held.delete(ticket)
      } else if (e.insuranceConsumed) {
        insured.delete(ticket)
      }
      const event: DrawEvent = {
        id: `audit-${e.seq}-${ticket}`,
        ticket,
        insured: Boolean(e.insuranceConsumed && !e.permanentlyEliminated),
        outcome: e.permanentlyEliminated ? 'eliminated' : 'returned',
        at: Date.parse(e.at) || Date.now(),
      }
      // history newest-first (UI convention)
      history.unshift(event)
      lastDrawn = event
    }
  }

  const total = clampTotalTickets(startingTickets, stopAt)
  const safeStop = clampStopAt(stopAt, total)
  const heldOut = normalizeTicketList([...held], total, eliminated)
  const preStartHeld = normalizeTicketList([...heldBeforeStart], total)
  const insuranceMarks = normalizeTicketList(
    [...insured].filter((n) => !eliminatedSet.has(n) && !held.has(n)),
    total,
    eliminated,
  )
  const remaining = total - eliminated.length - heldOut.length
  const finished = remaining <= safeStop && (eliminated.length > 0 || history.length > 0)

  return {
    total,
    stopAt: safeStop,
    paceMs: clampPaceMs(paceMs),
    orgName,
    eliminated,
    heldOut,
    preStartHeld,
    insuranceMarks,
    history: history.slice(0, 50),
    lastDrawn,
    remaining,
    status: (finished ? 'finished' : eliminated.length > 0 || history.length > 0 || heldOut.length > 0
      ? 'paused'
      : 'idle') as SessionSnapshot['status'],
    seenStart,
  }
}

/**
 * Prefer embedded recovery.session UI fields (brand/scale/tiers), but always
 * rebuild ticket state from the audit chain so disk/audit cannot diverge.
 */
export function reconstructFromDurableBlob(
  raw: unknown,
  uiHints?: Partial<SessionConfig>,
): ReconstructedEvent | ReconstructFailure {
  if (!isLocalAuditBlob(raw)) {
    return { ok: false, reason: 'Not a durable audit blob' }
  }
  const pkg = raw.package
  const verify = verifyAuditPackage(pkg)
  if (!verify.ok) {
    return {
      ok: false,
      reason: verify.checks.find((c) => c.status === 'fail')?.detail || 'Audit verification failed',
      verify,
    }
  }

  const state = replayTicketState(pkg.entries, pkg.startingTickets)
  const embedded =
    raw.recovery?.session && typeof raw.recovery.session === 'object'
      ? raw.recovery.session
      : null

  const brandFromEmbedded =
    embedded &&
    (typeof embedded.config?.brandImageDataUrl === 'string' ||
      embedded.config?.brandImageDataUrl === null)
      ? embedded.config.brandImageDataUrl
      : uiHints?.brandImageDataUrl ?? DEFAULT_CONFIG.brandImageDataUrl

  const ticketScale = clampTicketScale(
    embedded?.config?.ticketScale ?? uiHints?.ticketScale ?? DEFAULT_CONFIG.ticketScale,
  )
  const prizeTiers = normalizePrizeTiers(
    embedded?.config?.prizeTiers ?? uiHints?.prizeTiers ?? [state.stopAt],
    state.total,
  )

  const config: SessionConfig = {
    ...DEFAULT_CONFIG,
    orgName: state.orgName || pkg.eventName || DEFAULT_CONFIG.orgName,
    totalTickets: state.total,
    stopAt: state.stopAt,
    paceMs: state.paceMs,
    ticketScale,
    prizeTiers,
    brandImageDataUrl: brandFromEmbedded ?? null,
    themeColors: normalizeOrgTheme(
      embedded?.config?.themeColors ?? uiHints?.themeColors ?? DEFAULT_CONFIG.themeColors,
    ),
  }

  // Never auto-resume: force paused/finished/idle — never 'running'
  let status = state.status
  if (status === ('running' as SessionSnapshot['status'])) status = 'paused'

  const draws = pkg.entries.filter((e) => e.type === 'draw_selection')
  const lastDraw = draws.length ? draws[draws.length - 1]! : null
  const hasLocalSeed = Boolean(raw.localSeedHex || (pkg.seed.revealed && pkg.seed.seedHex))

  const snapshot: SessionSnapshot = {
    version: SNAPSHOT_VERSION,
    savedAt: raw.recovery?.savedAt || pkg.updatedAt || new Date().toISOString(),
    config,
    insuranceMarks: state.insuranceMarks,
    eliminated: state.eliminated,
    heldOut: state.heldOut,
    preStartHeld: state.preStartHeld,
    history: state.history,
    lastDrawn: state.lastDrawn,
    status,
    eventId: pkg.eventId,
  }

  return {
    ok: true,
    snapshot,
    verify,
    drawCount: draws.length,
    remaining: state.remaining,
    lastCommittedTicket: lastDraw?.ticket ?? null,
    lastCommittedAt: lastDraw?.at ?? null,
    hasLocalSeed,
    finalized: Boolean(pkg.finalized),
  }
}

export function countCommittedDraws(pkg: AuditPackage) {
  return pkg.entries.filter((e) => e.type === 'draw_selection').length
}

/** Build the recovery attachment written atomically with each durable audit save. */
export function buildRecoveryAttachment(
  blob: LocalAuditBlob,
  config: SessionConfig,
): RecoveryAttachment | undefined {
  const result = reconstructFromDurableBlob(blob, config)
  if (!result.ok) return undefined
  const status =
    result.snapshot.status === 'finished'
      ? 'finished'
      : result.snapshot.status === 'idle'
        ? 'idle'
        : 'paused'
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    session: {
      ...result.snapshot,
      status,
      config: {
        ...result.snapshot.config,
        brandImageDataUrl: config.brandImageDataUrl,
        ticketScale: config.ticketScale,
        prizeTiers: config.prizeTiers,
        paceMs: config.paceMs,
        orgName: config.orgName || result.snapshot.config.orgName,
      },
    },
  }
}

/** True when durable progress should not be silently ignored for an idle/empty local session. */
export function durableAheadOfLocal(input: {
  durableDraws: number
  durableEliminated: number
  localDraws: number
  localEliminated: number
  localStatus: string | null | undefined
  sameEvent: boolean
}) {
  if (input.durableDraws <= 0 && input.durableEliminated <= 0) return false
  if (!input.sameEvent && (input.localDraws > 0 || input.localEliminated > 0)) {
    // Different event locally — still offer durable if local has no mid-event progress
    return input.localDraws === 0 && input.localEliminated === 0
  }
  if (input.durableDraws > input.localDraws) return true
  if (input.durableEliminated > input.localEliminated) return true
  if (
    (input.localStatus === 'idle' || !input.localStatus) &&
    (input.durableDraws > 0 || input.durableEliminated > 0)
  ) {
    return true
  }
  return false
}
