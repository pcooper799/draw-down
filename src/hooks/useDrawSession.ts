import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AuditEngine,
  flushAuditDurable,
  readLocalAudit,
  validateEligiblePool,
  writeLocalAudit,
  type AuditEntry,
} from '@/lib/audit'
import {
  canInsureTicket,
  canMarkTicketHeld,
  clampPaceMs,
  clampStopAt,
  clampTicketScale,
  clampTotalTickets,
  MAX_TICKETS,
  normalizePrizeTiers,
  normalizeTicketList,
  pruneInsuranceMarks,
} from '@/lib/drawRules'
import {
  buildPoolFromSnapshot,
  clearAutosave,
  downloadSnapshotFile,
  readAutosave,
  readSnapshotFromFile,
  toSnapshot,
  writeAutosave,
  type SessionSnapshot,
} from '@/lib/sessionPersist'
import {
  DEFAULT_CONFIG,
  type DrawEvent,
  type DrawStatus,
  type SessionConfig,
  type Ticket,
} from '@/types'

/** Pause after operator continues past a prize stop before the next ticket is drawn. */
export const CONTINUE_RESUME_DELAY_MS = 3000

export type StartOptions = {
  /** When true, wait CONTINUE_RESUME_DELAY_MS before the first pull (prize-stop continue). */
  afterPrizeStop?: boolean
}

function buildPool(total: number, insured: Set<number>): Ticket[] {
  return Array.from({ length: total }, (_, i) => {
    const number = i + 1
    return { number, insured: insured.has(number) }
  })
}

function createAudit(config: SessionConfig, eventId?: string) {
  const existing = eventId ? readLocalAudit(eventId) : null
  if (existing?.package) {
    return AuditEngine.fromLocalPersist(existing)
  }
  const engine = new AuditEngine({
    eventName: config.orgName,
    startingTickets: config.totalTickets,
  })
  engine.append({
    type: 'event_created',
    note: 'Draw event created',
    details: {
      startingTickets: config.totalTickets,
      stopAt: config.stopAt,
      paceMs: config.paceMs,
    },
    eligibleBefore: config.totalTickets,
    eligibleAfter: config.totalTickets,
  })
  writeLocalAudit(engine)
  return engine
}

function hydrateFromSnapshot(snapshot: SessionSnapshot) {
  const total = clampTotalTickets(snapshot.config.totalTickets, snapshot.config.stopAt)
  const stopAt = clampStopAt(snapshot.config.stopAt, total)
  const config: SessionConfig = {
    ...snapshot.config,
    totalTickets: total,
    stopAt,
    paceMs: clampPaceMs(snapshot.config.paceMs),
    ticketScale: clampTicketScale(snapshot.config.ticketScale ?? 1),
    prizeTiers: normalizePrizeTiers(snapshot.config.prizeTiers ?? [stopAt], total),
  }
  const eliminated = snapshot.eliminated.filter((n) => n >= 1 && n <= total)
  const heldOut = normalizeTicketList(snapshot.heldOut ?? [], total, eliminated)
  const started =
    snapshot.status !== 'idle' ||
    eliminated.length > 0 ||
    snapshot.history.length > 0 ||
    Boolean(snapshot.eventId && snapshot.status !== 'idle')
  // Keep the frozen pre-start hold permission set intact even if some of those
  // tickets were later eliminated (BUG-001). Hold/restore/draw still reject outs.
  const preStartHeld = normalizeTicketList(
    snapshot.preStartHeld ?? (started ? heldOut : []),
    total,
  )
  const marks = pruneInsuranceMarks(snapshot.insuranceMarks, total, eliminated)
  const audit = createAudit(config, snapshot.eventId)
  return {
    config,
    insuranceMarks: marks,
    pool: buildPoolFromSnapshot(total, eliminated, marks, heldOut),
    eliminated,
    heldOut,
    preStartHeld,
    history: snapshot.history,
    lastDrawn: snapshot.lastDrawn,
    status: snapshot.status as DrawStatus,
    audit,
  }
}

async function persistAudit(engine: AuditEngine) {
  const blob = writeLocalAudit(engine)
  await flushAuditDurable(blob)
}

/** Finished events should not reopen with leftover greens — start a clean yellow pool. */
function freshYellowFromConfig(config: SessionConfig, notice: string) {
  const empty = new Set<number>()
  const audit = createAudit(config)
  const snapshot = toSnapshot({
    config,
    insuranceMarks: empty,
    eliminated: [],
    heldOut: [],
    history: [],
    lastDrawn: null,
    status: 'idle',
    eventId: audit.eventId,
  })
  writeAutosave(snapshot)
  return {
    config,
    insuranceMarks: empty,
    pool: buildPool(config.totalTickets, empty),
    eliminated: [] as number[],
    heldOut: [] as number[],
    preStartHeld: [] as number[],
    history: [] as DrawEvent[],
    lastDrawn: null as DrawEvent | null,
    status: 'idle' as DrawStatus,
    audit,
    restoredAt: null as string | null,
    bootNotice: notice,
  }
}

export function useDrawSession() {
  const initial = useMemo(() => {
    const saved = typeof window !== 'undefined' ? readAutosave() : null
    if (saved?.status === 'finished') {
      return freshYellowFromConfig(
        saved.config,
        'Previous event was finished — started fresh (all tickets yellow)',
      )
    }
    if (saved) {
      const hydrated = hydrateFromSnapshot(saved)
      const insured = hydrated.insuranceMarks.size
      const midDraw =
        hydrated.eliminated.length > 0 ||
        hydrated.history.length > 0 ||
        hydrated.status === 'paused'
      return {
        ...hydrated,
        restoredAt: saved.savedAt,
        bootNotice: midDraw
          ? insured > 0
            ? `Restored mid-event · ${insured} insured (green). Reset for a new all-yellow event.`
            : 'Restored previous mid-event session'
          : insured > 0
            ? `Restored setup · ${insured} insured (green). Reset or Clear all insurance for all yellow.`
            : 'Restored previous session',
      }
    }
    const config = DEFAULT_CONFIG
    const audit = createAudit(config)
    return {
      config,
      insuranceMarks: new Set<number>(),
      pool: buildPool(config.totalTickets, new Set()),
      eliminated: [] as number[],
      heldOut: [] as number[],
      preStartHeld: [] as number[],
      history: [] as DrawEvent[],
      lastDrawn: null as DrawEvent | null,
      status: 'idle' as DrawStatus,
      audit,
      restoredAt: null as string | null,
      bootNotice: null as string | null,
    }
  }, [])

  const [config, setConfig] = useState<SessionConfig>(initial.config)
  const [insuranceMarks, setInsuranceMarks] = useState<Set<number>>(() => initial.insuranceMarks)
  const [pool, setPool] = useState<Ticket[]>(() => initial.pool)
  const [eliminated, setEliminated] = useState<number[]>(() => initial.eliminated)
  const [heldOut, setHeldOut] = useState<number[]>(() => initial.heldOut)
  const [preStartHeld, setPreStartHeld] = useState<number[]>(
    () => initial.preStartHeld ?? [],
  )
  const [safePaused, setSafePaused] = useState(false)
  const safePausedRef = useRef(false)
  const [history, setHistory] = useState<DrawEvent[]>(() => initial.history)
  const [status, setStatus] = useState<DrawStatus>(initial.status)
  const [lastDrawn, setLastDrawn] = useState<DrawEvent | null>(initial.lastDrawn)
  const [flashKey, setFlashKey] = useState(0)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initial.restoredAt)
  const [saveNotice, setSaveNotice] = useState<string | null>(initial.bootNotice)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(() => [...initial.audit.entries])
  const [seedCommitment, setSeedCommitment] = useState<string | null>(
    () => initial.audit.seed.commitment || null,
  )
  const [seedRevealed, setSeedRevealed] = useState(() => initial.audit.seed.revealed)

  const timerRef = useRef<number | null>(null)
  const leadInTimerRef = useRef<number | null>(null)
  const leadInActiveRef = useRef(false)
  const leadInResolveRef = useRef<(() => void) | null>(null)
  const preStartHeldFrozenRef = useRef(false)
  const poolRef = useRef(pool)
  const statusRef = useRef(status)
  const configRef = useRef(config)
  const insuranceRef = useRef(insuranceMarks)
  const eliminatedRef = useRef(eliminated)
  const heldOutRef = useRef(heldOut)
  const preStartHeldRef = useRef<Set<number>>(new Set(initial.preStartHeld ?? []))
  const historyRef = useRef(history)
  const lastDrawnRef = useRef(lastDrawn)
  const auditRef = useRef(initial.audit)
  const readyToAutosave = useRef(false)
  const drawLockRef = useRef(false)

  // Freeze pre-start held set once the event has already progressed (restored mid-draw).
  const [preStartHeldFrozen] = useState(
    () =>
      initial.status === 'running' ||
      initial.status === 'paused' ||
      initial.status === 'finished' ||
      initial.history.length > 0 ||
      initial.eliminated.length > 0 ||
      Boolean(initial.audit.seed.commitment),
  )
  preStartHeldFrozenRef.current = preStartHeldFrozen

  useEffect(() => {
    poolRef.current = pool
  }, [pool])
  useEffect(() => {
    statusRef.current = status
  }, [status])
  useEffect(() => {
    configRef.current = config
  }, [config])
  useEffect(() => {
    insuranceRef.current = insuranceMarks
  }, [insuranceMarks])
  useEffect(() => {
    eliminatedRef.current = eliminated
  }, [eliminated])
  useEffect(() => {
    heldOutRef.current = heldOut
  }, [heldOut])
  useEffect(() => {
    safePausedRef.current = safePaused
  }, [safePaused])
  useEffect(() => {
    historyRef.current = history
  }, [history])
  useEffect(() => {
    lastDrawnRef.current = lastDrawn
  }, [lastDrawn])

  useEffect(() => {
    const id = window.setTimeout(() => {
      readyToAutosave.current = true
    }, 400)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!saveNotice) return
    const id = window.setTimeout(() => setSaveNotice(null), 4000)
    return () => window.clearTimeout(id)
  }, [saveNotice])

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /** Cancel prize-stop continue lead-in without leaving the waiter hung. */
  const clearLeadIn = useCallback(() => {
    if (leadInTimerRef.current != null) {
      window.clearTimeout(leadInTimerRef.current)
      leadInTimerRef.current = null
    }
    leadInActiveRef.current = false
    const resolve = leadInResolveRef.current
    leadInResolveRef.current = null
    resolve?.()
  }, [])

  const syncAuditUi = useCallback(() => {
    setAuditEntries([...auditRef.current.entries])
    setSeedCommitment(auditRef.current.seed.commitment || null)
    setSeedRevealed(auditRef.current.seed.revealed)
  }, [])

  const remaining = pool.length
  const insuredRemaining = useMemo(() => pool.filter((t) => t.insured).length, [pool])
  const digits = String(Math.max(config.totalTickets, 1)).length

  const sessionDrawHasStarted = useCallback(() => {
    return (
      statusRef.current === 'running' ||
      statusRef.current === 'paused' ||
      statusRef.current === 'finished' ||
      historyRef.current.length > 0 ||
      eliminatedRef.current.length > 0 ||
      Boolean(auditRef.current.seed.commitment)
    )
  }, [])

  const captureSnapshot = useCallback((): SessionSnapshot => {
    return toSnapshot({
      config: configRef.current,
      insuranceMarks: insuranceRef.current,
      eliminated: eliminatedRef.current,
      heldOut: heldOutRef.current,
      preStartHeld: [...preStartHeldRef.current],
      history: historyRef.current,
      lastDrawn: lastDrawnRef.current,
      status: statusRef.current,
      eventId: auditRef.current.eventId,
    })
  }, [])

  const applyConfig = useCallback(
    (next: Partial<SessionConfig>) => {
      let prevStop = configRef.current.stopAt
      let prevName = configRef.current.orgName
      // Pace is locked after the first Start until a gated Reset / new event.
      const drawStarted =
        statusRef.current === 'running' ||
        statusRef.current === 'paused' ||
        statusRef.current === 'finished' ||
        historyRef.current.length > 0 ||
        eliminatedRef.current.length > 0 ||
        Boolean(auditRef.current.seed.commitment)
      if (drawStarted && next.paceMs != null && next.paceMs !== configRef.current.paceMs) {
        setSaveNotice('Pace is locked after Start — Reset for a new event to change speed')
        const { paceMs: _ignored, ...rest } = next
        next = rest
        if (Object.keys(next).length === 0) return
      }
      setConfig((prev) => {
        const merged = { ...prev, ...next }
        merged.stopAt = clampStopAt(merged.stopAt, merged.totalTickets)
        merged.totalTickets = clampTotalTickets(merged.totalTickets, merged.stopAt)
        merged.stopAt = clampStopAt(merged.stopAt, merged.totalTickets)
        merged.paceMs = clampPaceMs(merged.paceMs)
        merged.ticketScale = clampTicketScale(merged.ticketScale)
        merged.prizeTiers = normalizePrizeTiers(
          merged.prizeTiers ?? [merged.stopAt],
          merged.totalTickets,
        )
        if (!merged.orgName?.trim()) merged.orgName = prev.orgName
        configRef.current = merged
        return merged
      })

      const rem = poolRef.current.length
      const stop = configRef.current.stopAt
      if (configRef.current.orgName !== prevName) {
        auditRef.current.setEventName(configRef.current.orgName)
      }
      if (stop !== prevStop) {
        auditRef.current.append({
          type: 'stop_at_changed',
          stopAt: stop,
          eligibleBefore: rem,
          eligibleAfter: rem,
          details: { prevStopAt: prevStop, nextStopAt: stop },
        })
        void persistAudit(auditRef.current).then(syncAuditUi)
      }

      if (statusRef.current === 'finished' && rem > stop) {
        statusRef.current = 'paused'
        setStatus('paused')
        setSaveNotice(`Ready to continue — next stop at ${stop} remaining`)
      } else if (
        rem <= stop &&
        (statusRef.current === 'running' || statusRef.current === 'paused')
      ) {
        clearTimer()
        drawLockRef.current = false
        statusRef.current = 'finished'
        setStatus('finished')
      }
    },
    [clearTimer, syncAuditUi],
  )

  const continueWithNewStop = useCallback(
    (stopAt: number) => {
      if (statusRef.current === 'running') return false
      const rem = poolRef.current.length
      const nextStop = clampStopAt(stopAt, configRef.current.totalTickets)
      if (rem <= nextStop) {
        setSaveNotice(`Need a stop below ${rem} remaining to keep drawing`)
        return false
      }
      applyConfig({ stopAt: nextStop })
      auditRef.current.append({
        type: 'continue',
        stopAt: nextStop,
        eligibleBefore: rem,
        eligibleAfter: rem,
        note: 'Operator continued after stop with new threshold',
      })
      void persistAudit(auditRef.current).then(syncAuditUi)
      return true
    },
    [applyConfig, syncAuditUi],
  )

  const syncInsuranceIntoPool = useCallback((marks: Set<number>) => {
    setPool((prev) => {
      const next = prev.map((t) => ({ ...t, insured: marks.has(t.number) }))
      poolRef.current = next
      return next
    })
  }, [])

  const setTicketInsured = useCallback(
    (ticket: number, insured: boolean) => {
      if (statusRef.current === 'running') return
      if (
        insured &&
        !canInsureTicket(
          ticket,
          configRef.current.totalTickets,
          eliminatedRef.current,
          heldOutRef.current,
        )
      ) {
        setSaveNotice('That ticket is already out — cannot insure it')
        return
      }
      const inPool = poolRef.current.some((t) => t.number === ticket)
      const wasHeld = heldOutRef.current.includes(ticket)
      setInsuranceMarks((prev) => {
        const next = new Set(prev)
        if (insured) next.add(ticket)
        else next.delete(ticket)
        const pruned = pruneInsuranceMarks(
          next,
          configRef.current.totalTickets,
          eliminatedRef.current,
        )
        insuranceRef.current = pruned
        syncInsuranceIntoPool(pruned)
        return pruned
      })
      auditRef.current.append({
        type: insured ? 'insurance_marked' : 'insurance_cleared',
        ticket,
        prevState: wasHeld ? 'held' : inPool ? (insured ? 'active' : 'insured') : 'eliminated',
        nextState: wasHeld ? 'held' : insured ? 'insured' : 'active',
        eligibleBefore: poolRef.current.length,
        eligibleAfter: poolRef.current.length,
      })
      void persistAudit(auditRef.current).then(syncAuditUi)
    },
    [syncInsuranceIntoPool, syncAuditUi],
  )

  const clearAllInsurance = useCallback(() => {
    if (statusRef.current === 'running') return
    const empty = new Set<number>()
    insuranceRef.current = empty
    setInsuranceMarks(empty)
    syncInsuranceIntoPool(empty)
    auditRef.current.append({
      type: 'insurance_cleared',
      note: 'Cleared all insurance marks',
      eligibleBefore: poolRef.current.length,
      eligibleAfter: poolRef.current.length,
    })
    void persistAudit(auditRef.current).then(syncAuditUi)
  }, [syncInsuranceIntoPool, syncAuditUi])

  const rebuildPool = useCallback(
    (
      total: number,
      marks: Set<number> = insuranceRef.current,
      meta?: {
        previousEventId?: string
        resetBy?: string
        resetReason?: string
        irreversibleConfirmed?: boolean
      },
    ) => {
      clearTimer()
      clearLeadIn()
      drawLockRef.current = false
      const safeTotal = clampTotalTickets(total, configRef.current.stopAt)
      const pruned = pruneInsuranceMarks(marks, safeTotal, [])
      const nextPool = buildPool(safeTotal, pruned)
      poolRef.current = nextPool
      eliminatedRef.current = []
      heldOutRef.current = []
      preStartHeldRef.current = new Set()
      preStartHeldFrozenRef.current = false
      historyRef.current = []
      lastDrawnRef.current = null
      statusRef.current = 'idle'
      insuranceRef.current = pruned
      setPool(nextPool)
      setEliminated([])
      setHeldOut([])
      setPreStartHeld([])
      setHistory([])
      setLastDrawn(null)
      setStatus('idle')
      setInsuranceMarks(pruned)

      const engine = new AuditEngine({
        eventName: configRef.current.orgName,
        startingTickets: safeTotal,
      })
      engine.append({
        type: 'event_created',
        note: meta?.previousEventId ? 'New draw pool after audited restart' : 'New draw pool',
        details: {
          startingTickets: safeTotal,
          stopAt: configRef.current.stopAt,
          ...(meta?.previousEventId
            ? {
                previousEventId: meta.previousEventId,
                resetBy: meta.resetBy,
                resetReason: meta.resetReason,
                irreversibleConfirmed: meta.irreversibleConfirmed === true,
              }
            : {}),
        },
        eligibleBefore: safeTotal,
        eligibleAfter: safeTotal,
        operatorId: meta?.resetBy,
      })
      auditRef.current = engine
      void persistAudit(engine).then(syncAuditUi)
    },
    [clearLeadIn, clearTimer, syncAuditUi],
  )

  const toggleTicketHold = useCallback(
    (ticket: number) => {
      const total = configRef.current.totalTickets
      if (!Number.isFinite(ticket)) return
      const n = Math.floor(ticket)
      if (n < 1 || n > total) return
      if (eliminatedRef.current.includes(n)) {
        setSaveNotice(`#${n} was drawn out — cannot bring back`)
        return
      }

      const eligibleBefore = poolRef.current.length
      const isHeld = heldOutRef.current.includes(n)
      if (isHeld) {
        const nextHeld = heldOutRef.current.filter((x) => x !== n)
        heldOutRef.current = nextHeld
        setHeldOut(nextHeld)
        const insured = insuranceRef.current.has(n)
        const nextPool = [...poolRef.current, { number: n, insured }].sort(
          (a, b) => a.number - b.number,
        )
        poolRef.current = nextPool
        setPool(nextPool)
        if (statusRef.current === 'finished' && nextPool.length > configRef.current.stopAt) {
          statusRef.current = 'paused'
          setStatus('paused')
        }
        auditRef.current.append({
          type: 'release',
          ticket: n,
          prevState: 'held',
          nextState: insured ? 'insured' : 'active',
          eligibleBefore,
          eligibleAfter: nextPool.length,
          auctionPrice: null,
          note: 'Held ticket released into draw',
        })
        if (!preStartHeldFrozenRef.current) {
          preStartHeldRef.current = new Set(nextHeld)
          setPreStartHeld(nextHeld)
        }
        void persistAudit(auditRef.current).then(syncAuditUi)
        setSaveNotice(`#${n} back in the draw`)
        return
      }

      if (!poolRef.current.some((t) => t.number === n)) {
        setSaveNotice(`#${n} is not in the draw`)
        return
      }

      const started = sessionDrawHasStarted()
      const holdGate = canMarkTicketHeld({
        ticket: n,
        drawHasStarted: started,
        preStartHeld: preStartHeldRef.current,
        currentlyHeld: false,
      })
      if (!holdGate.ok) {
        setSaveNotice(holdGate.reason)
        return
      }

      if (statusRef.current === 'running') {
        clearTimer()
        clearLeadIn()
        drawLockRef.current = false
        statusRef.current = 'paused'
        setStatus('paused')
        auditRef.current.append({
          type: 'pause',
          note: 'Auto-paused to hold ticket',
          eligibleBefore,
          eligibleAfter: eligibleBefore,
        })
      }

      const wasInsured = poolRef.current.find((t) => t.number === n)?.insured ?? false
      const nextPool = poolRef.current.filter((t) => t.number !== n)
      poolRef.current = nextPool
      setPool(nextPool)
      const nextHeld = [n, ...heldOutRef.current.filter((x) => x !== n)]
      heldOutRef.current = nextHeld
      setHeldOut(nextHeld)

      // Before Start, the pre-start held set tracks current holds.
      if (!preStartHeldFrozenRef.current) {
        preStartHeldRef.current = new Set(nextHeld)
        setPreStartHeld(nextHeld)
      }

      auditRef.current.append({
        type: 'hold',
        ticket: n,
        prevState: wasInsured ? 'insured' : 'active',
        nextState: 'held',
        eligibleBefore,
        eligibleAfter: nextPool.length,
        auctionPrice: null,
        note: 'Ticket held out of draw (auction/other)',
      })

      if (nextPool.length <= configRef.current.stopAt) {
        statusRef.current = 'finished'
        setStatus('finished')
        clearTimer()
        clearLeadIn()
        drawLockRef.current = false
        auditRef.current.append({
          type: 'stop_reached',
          stopAt: configRef.current.stopAt,
          ticket: n,
          eligibleBefore: nextPool.length,
          eligibleAfter: nextPool.length,
          note: 'Stop reached after hold',
        })
      }

      void persistAudit(auditRef.current).then(syncAuditUi)
      setSaveNotice(`#${n} held out — right-click to bring back`)
    },
    [clearLeadIn, clearTimer, sessionDrawHasStarted, syncAuditUi],
  )

  const commitTotalTickets = useCallback(
    (total: number) => {
      if (statusRef.current === 'running') return
      // After Start, pool size changes must go through audited Reset — not silent rebuild.
      const started =
        statusRef.current === 'paused' ||
        statusRef.current === 'finished' ||
        historyRef.current.length > 0 ||
        eliminatedRef.current.length > 0 ||
        Boolean(auditRef.current.seed.commitment)
      if (started) {
        setSaveNotice('Draw already started — use Reset (name + reason) to change ticket count')
        return
      }
      const stopAt = configRef.current.stopAt
      const safe = clampTotalTickets(total, stopAt)
      // Same count: no rebuild — preserves insurance marks (wizard Finish must not wipe them).
      if (safe === configRef.current.totalTickets) return
      applyConfig({ totalTickets: safe })
      const empty = new Set<number>()
      insuranceRef.current = empty
      setInsuranceMarks(empty)
      rebuildPool(safe, empty)
    },
    [applyConfig, rebuildPool],
  )

  const drawHasStarted =
    status === 'running' ||
    status === 'paused' ||
    status === 'finished' ||
    history.length > 0 ||
    eliminated.length > 0 ||
    Boolean(seedCommitment)

  /**
   * Before first Start: free reset.
   * After the draw has started: require operator name + reason; records on the
   * current audit log, then opens a brand-new audit event for the next game.
   */
  const resetSession = useCallback(
    (auth?: { operatorName: string; reason: string; irreversibleConfirmed?: boolean }) => {
      const started =
        statusRef.current === 'running' ||
        statusRef.current === 'paused' ||
        statusRef.current === 'finished' ||
        historyRef.current.length > 0 ||
        eliminatedRef.current.length > 0 ||
        Boolean(auditRef.current.seed.commitment)

      const operatorName = auth?.operatorName?.trim() ?? ''
      const reason = auth?.reason?.trim() ?? ''
      const irreversibleConfirmed = auth?.irreversibleConfirmed === true

      if (started && (!operatorName || !reason || !irreversibleConfirmed)) {
        return false
      }

      if (statusRef.current === 'running') clearTimer()
      safePausedRef.current = false
      setSafePaused(false)

      const previousEventId = auditRef.current.eventId
      auditRef.current.append({
        type: 'reset',
        operatorId: operatorName || 'local-operator',
        note: started
          ? `Restart authorized — ${reason}`
          : 'Operator reset session before first draw — new event id follows',
        eligibleBefore: poolRef.current.length,
        eligibleAfter: configRef.current.totalTickets,
        details: {
          drawHadStarted: started,
          operatorName: operatorName || null,
          reason: reason || null,
          irreversibleConfirmed: started ? irreversibleConfirmed : null,
          irreversibleWarningAcknowledged: started
            ? 'Yes — I understand this cannot be undone and I want to reset the board.'
            : null,
          previousEventId,
          status: statusRef.current,
          eliminatedCount: eliminatedRef.current.length,
          historyCount: historyRef.current.length,
          insuredCount: insuranceRef.current.size,
          heldOutCount: heldOutRef.current.length,
          remainingAtReset: poolRef.current.length,
        },
      })
      // Persist the closed/prior event audit before switching to a new event id.
      void persistAudit(auditRef.current)

      const empty = new Set<number>()
      insuranceRef.current = empty
      setInsuranceMarks(empty)
      rebuildPool(
        configRef.current.totalTickets,
        empty,
        started
          ? {
              previousEventId,
              resetBy: operatorName,
              resetReason: reason,
              irreversibleConfirmed: true,
            }
          : undefined,
      )
      setSaveNotice(
        started
          ? `Restart recorded by ${operatorName} — new audit log started`
          : 'Session reset — all tickets yellow',
      )
      return true
    },
    [rebuildPool, clearTimer],
  )

  const applySnapshot = useCallback(
    (snapshot: SessionSnapshot, notice: string) => {
      clearTimer()
      clearLeadIn()
      drawLockRef.current = false
      const hydrated = hydrateFromSnapshot(snapshot)
      configRef.current = hydrated.config
      insuranceRef.current = hydrated.insuranceMarks
      poolRef.current = hydrated.pool
      eliminatedRef.current = hydrated.eliminated
      heldOutRef.current = hydrated.heldOut
      preStartHeldRef.current = new Set(hydrated.preStartHeld)
      preStartHeldFrozenRef.current =
        hydrated.status !== 'idle' ||
        hydrated.eliminated.length > 0 ||
        hydrated.history.length > 0 ||
        Boolean(hydrated.audit.seed.commitment)
      historyRef.current = hydrated.history
      lastDrawnRef.current = hydrated.lastDrawn
      statusRef.current = hydrated.status
      auditRef.current = hydrated.audit
      setConfig(hydrated.config)
      setInsuranceMarks(hydrated.insuranceMarks)
      setPool(hydrated.pool)
      setEliminated(hydrated.eliminated)
      setHeldOut(hydrated.heldOut)
      setPreStartHeld(hydrated.preStartHeld)
      setHistory(hydrated.history)
      setLastDrawn(hydrated.lastDrawn)
      setStatus(hydrated.status)
      setLastSavedAt(snapshot.savedAt)
      syncAuditUi()
      writeAutosave(
        toSnapshot({
          config: hydrated.config,
          insuranceMarks: hydrated.insuranceMarks,
          eliminated: hydrated.eliminated,
          heldOut: hydrated.heldOut,
          preStartHeld: hydrated.preStartHeld,
          history: hydrated.history,
          lastDrawn: hydrated.lastDrawn,
          status: hydrated.status,
          eventId: hydrated.audit.eventId,
        }),
      )
      setSaveNotice(notice)
    },
    [clearLeadIn, clearTimer, syncAuditUi],
  )

  const saveNow = useCallback(() => {
    const snapshot = captureSnapshot()
    writeAutosave(snapshot)
    void persistAudit(auditRef.current)
    setLastSavedAt(snapshot.savedAt)
    setSaveNotice('Session saved')
    return snapshot
  }, [captureSnapshot])

  const exportSaveFile = useCallback(() => {
    const snapshot = saveNow()
    downloadSnapshotFile(snapshot)
    setSaveNotice('Save file downloaded')
  }, [saveNow])

  const loadSaveFile = useCallback(
    async (file: File) => {
      if (statusRef.current === 'running') {
        clearTimer()
        statusRef.current = 'paused'
        setStatus('paused')
      }
      const snapshot = await readSnapshotFromFile(file)
      if (!snapshot) {
        setSaveNotice('Could not read that save file')
        return false
      }
      applySnapshot(snapshot, 'Loaded save file')
      return true
    },
    [applySnapshot, clearTimer],
  )

  const discardAutosave = useCallback(() => {
    clearAutosave()
    setLastSavedAt(null)
    setSaveNotice('Cleared autosave')
  }, [])

  useEffect(() => {
    if (!readyToAutosave.current) return
    const id = window.setTimeout(() => {
      const snapshot = captureSnapshot()
      writeAutosave(snapshot)
      setLastSavedAt(snapshot.savedAt)
    }, 500)
    return () => window.clearTimeout(id)
  }, [
    config,
    insuranceMarks,
    eliminated,
    heldOut,
    history,
    lastDrawn,
    status,
    pool,
    auditEntries,
    captureSnapshot,
  ])

  useEffect(() => {
    const flush = () => {
      writeAutosave(captureSnapshot())
      writeLocalAudit(auditRef.current)
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [captureSnapshot])

  const drawOnce = useCallback(async () => {
    const currentPool = poolRef.current
    const cfg = configRef.current
    if (currentPool.length === 0 || currentPool.length <= cfg.stopAt) {
      statusRef.current = 'finished'
      setStatus('finished')
      clearTimer()
      drawLockRef.current = false
      return
    }

    const validation = validateEligiblePool({
      totalTickets: cfg.totalTickets,
      pool: currentPool,
      eliminated: eliminatedRef.current,
      heldOut: heldOutRef.current,
    })
    if (!validation.ok) {
      clearTimer()
      drawLockRef.current = false
      statusRef.current = 'paused'
      setStatus('paused')
      auditRef.current.append({
        type: 'integrity_halt',
        note: validation.reason,
        eligibleBefore: currentPool.length,
        eligibleAfter: currentPool.length,
      })
      await persistAudit(auditRef.current)
      syncAuditUi()
      setSaveNotice(`Draw halted — ${validation.reason}`)
      return
    }

    try {
      auditRef.current.ensureSeed()
      if (!auditRef.current.seed.commitment) {
        auditRef.current.commitSeed()
      }
      const pick = auditRef.current.pickUnbiasedIndex(validation.eligibleSorted)
      const ticket = currentPool.find((t) => t.number === pick.ticket)
      if (!ticket) {
        throw new Error(`Selected ticket ${pick.ticket} missing from pool`)
      }

      const eligibleBefore = currentPool.length
      const selectionNumber = auditRef.current.nextSelectionNumber()
      const insuranceConsumed = ticket.insured
      const permanentlyEliminated = !ticket.insured

      let nextPool: Ticket[]
      if (ticket.insured) {
        nextPool = currentPool.map((t) =>
          t.number === ticket.number ? { ...t, insured: false } : t,
        )
      } else {
        nextPool = currentPool.filter((t) => t.number !== ticket.number)
      }

      auditRef.current.append({
        type: 'draw_selection',
        selectionNumber,
        ticket: ticket.number,
        prevState: ticket.insured ? 'insured' : 'active',
        nextState: permanentlyEliminated ? 'eliminated' : 'active',
        insuranceConsumed,
        permanentlyEliminated,
        eligibleBefore,
        eligibleAfter: nextPool.length,
        stopAt: cfg.stopAt,
        rng: pick.rng,
      })

      // Durable commit BEFORE UI mutation
      await persistAudit(auditRef.current)
      syncAuditUi()
      setSeedCommitment(auditRef.current.seed.commitment)

      const event: DrawEvent = {
        id: `${Date.now()}-${ticket.number}-${selectionNumber}`,
        ticket: ticket.number,
        insured: ticket.insured,
        outcome: ticket.insured ? 'returned' : 'eliminated',
        at: Date.now(),
      }

      lastDrawnRef.current = event
      setLastDrawn(event)
      setFlashKey((k) => k + 1)
      setHistory((h) => {
        const next = [event, ...h].slice(0, 50)
        historyRef.current = next
        return next
      })

      if (ticket.insured) {
        setInsuranceMarks((prev) => {
          const next = new Set(prev)
          next.delete(ticket.number)
          insuranceRef.current = next
          return next
        })
        poolRef.current = nextPool
        setPool(nextPool)
      } else {
        poolRef.current = nextPool
        setPool(nextPool)
        setEliminated((prev) => {
          const next = [ticket.number, ...prev]
          eliminatedRef.current = next
          if (insuranceRef.current.has(ticket.number)) {
            const marks = new Set(insuranceRef.current)
            marks.delete(ticket.number)
            insuranceRef.current = marks
            setInsuranceMarks(marks)
          }
          return next
        })
      }

      if (nextPool.length <= cfg.stopAt) {
        statusRef.current = 'finished'
        setStatus('finished')
        clearTimer()
        drawLockRef.current = false
        auditRef.current.append({
          type: 'stop_reached',
          ticket: ticket.number,
          stopAt: cfg.stopAt,
          eligibleBefore: nextPool.length,
          eligibleAfter: nextPool.length,
          note: 'Automatic stopping point reached',
          details: {
            displayedTicket: ticket.number,
            remaining: nextPool.length,
            threshold: cfg.stopAt,
          },
        })
        await persistAudit(auditRef.current)
        syncAuditUi()
      }
    } catch (error) {
      clearTimer()
      drawLockRef.current = false
      statusRef.current = 'paused'
      setStatus('paused')
      const message = error instanceof Error ? error.message : 'Unknown draw error'
      auditRef.current.append({
        type: 'integrity_halt',
        note: message,
        eligibleBefore: currentPool.length,
        eligibleAfter: currentPool.length,
      })
      await persistAudit(auditRef.current)
      syncAuditUi()
      setSaveNotice(`Draw halted — ${message}`)
    }
  }, [clearTimer, syncAuditUi])

  const scheduleNext = useCallback(() => {
    clearTimer()
    // Never steal the prize-stop continue lead-in timer / start a pace tick early.
    if (leadInActiveRef.current) return
    if (statusRef.current !== 'running') return
    if (poolRef.current.length <= configRef.current.stopAt) {
      statusRef.current = 'finished'
      setStatus('finished')
      drawLockRef.current = false
      return
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (statusRef.current !== 'running' || leadInActiveRef.current) return
      void (async () => {
        await drawOnce()
        if (statusRef.current === 'running' && poolRef.current.length > configRef.current.stopAt) {
          scheduleNext()
        } else {
          drawLockRef.current = false
        }
      })()
    }, configRef.current.paceMs)
  }, [clearTimer, drawOnce])

  const start = useCallback(
    (opts?: StartOptions) => {
      if (statusRef.current === 'running' || drawLockRef.current) return
      if (safePausedRef.current) {
        setSaveNotice('Emergency stop is active — confirm Resume in the dialog')
        return false
      }
      if (poolRef.current.length <= configRef.current.stopAt) {
        statusRef.current = 'finished'
        setStatus('finished')
        return false
      }

      const wasPaused = statusRef.current === 'paused' || statusRef.current === 'finished'
      const resumeDelayMs = opts?.afterPrizeStop ? CONTINUE_RESUME_DELAY_MS : 0

      // Freeze the pre-start held set on first Start so mid-event holds stay limited.
      if (!preStartHeldFrozenRef.current) {
        preStartHeldRef.current = new Set(heldOutRef.current)
        setPreStartHeld([...preStartHeldRef.current])
        preStartHeldFrozenRef.current = true
      }

      auditRef.current.ensureSeed()
      if (!auditRef.current.seed.commitment) {
        auditRef.current.commitSeed()
      }
      setSeedCommitment(auditRef.current.seed.commitment)
      auditRef.current.append({
        type: wasPaused ? 'resume' : 'start',
        note:
          wasPaused && resumeDelayMs > 0
            ? `Drawing resumed after prize stop (${resumeDelayMs}ms lead-in)`
            : wasPaused
              ? 'Drawing resumed'
              : 'Drawing started',
        eligibleBefore: poolRef.current.length,
        eligibleAfter: poolRef.current.length,
        stopAt: configRef.current.stopAt,
        seedCommitment: auditRef.current.seed.commitment,
        details: resumeDelayMs > 0 ? { resumeDelayMs } : undefined,
      })
      void persistAudit(auditRef.current).then(syncAuditUi)

      drawLockRef.current = true
      statusRef.current = 'running'
      setStatus('running')
      if (resumeDelayMs > 0) {
        setSaveNotice(
          `Continuing in ${Math.round(resumeDelayMs / 1000)}s — next stop at ${configRef.current.stopAt}`,
        )
      }
      void (async () => {
        if (resumeDelayMs > 0) {
          await new Promise<void>((resolve) => {
            clearLeadIn()
            leadInActiveRef.current = true
            leadInResolveRef.current = () => {
              leadInActiveRef.current = false
              resolve()
            }
            leadInTimerRef.current = window.setTimeout(() => {
              leadInTimerRef.current = null
              const done = leadInResolveRef.current
              leadInResolveRef.current = null
              leadInActiveRef.current = false
              done?.()
            }, resumeDelayMs)
          })
          if (statusRef.current !== 'running') {
            drawLockRef.current = false
            leadInActiveRef.current = false
            return
          }
        }
        await drawOnce()
        if (statusRef.current === 'running' && poolRef.current.length > configRef.current.stopAt) {
          scheduleNext()
        } else {
          drawLockRef.current = false
        }
      })()
      return true
    },
    [clearLeadIn, drawOnce, scheduleNext, syncAuditUi],
  )

  const pause = useCallback(
    (note = 'Manual pause') => {
      clearTimer()
      clearLeadIn()
      drawLockRef.current = false
      if (statusRef.current === 'running') {
        statusRef.current = 'paused'
        setStatus('paused')
        auditRef.current.append({
          type: 'pause',
          note,
          eligibleBefore: poolRef.current.length,
          eligibleAfter: poolRef.current.length,
          stopAt: configRef.current.stopAt,
        })
        void persistAudit(auditRef.current).then(syncAuditUi)
        writeAutosave(
          toSnapshot({
            config: configRef.current,
            insuranceMarks: insuranceRef.current,
            eliminated: eliminatedRef.current,
            heldOut: heldOutRef.current,
            preStartHeld: [...preStartHeldRef.current],
            history: historyRef.current,
            lastDrawn: lastDrawnRef.current,
            status: 'paused',
            eventId: auditRef.current.eventId,
          }),
        )
        return true
      }
      return false
    },
    [clearLeadIn, clearTimer, syncAuditUi],
  )

  /** Instant safe pause — does not reset pool/insurance/history. Resume needs confirm. */
  const emergencyStop = useCallback(() => {
    const wasRunning = statusRef.current === 'running'
    pause('Emergency stop / safe pause')
    safePausedRef.current = true
    setSafePaused(true)
    if (!wasRunning && statusRef.current === 'paused') {
      auditRef.current.append({
        type: 'pause',
        note: 'Emergency stop armed (draw already paused)',
        eligibleBefore: poolRef.current.length,
        eligibleAfter: poolRef.current.length,
        stopAt: configRef.current.stopAt,
        details: { emergency: true },
      })
      void persistAudit(auditRef.current).then(syncAuditUi)
    }
    setSaveNotice('EMERGENCY STOP — draw held; confirm to resume')
  }, [pause, syncAuditUi])

  /** Clear the emergency latch and resume drawing (after operator confirms). */
  const confirmSafeResume = useCallback(() => {
    safePausedRef.current = false
    setSafePaused(false)
    return start()
  }, [start])

  const revealAuditSeed = useCallback(async () => {
    try {
      const hex = auditRef.current.revealSeed()
      await persistAudit(auditRef.current)
      syncAuditUi()
      setSaveNotice('Audit seed revealed for verification')
      return hex
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : 'Could not reveal seed')
      return null
    }
  }, [syncAuditUi])

  const exportAuditPackage = useCallback(() => {
    return auditRef.current.toPackage()
  }, [])

  useEffect(() => {
    if (statusRef.current === 'running' && !leadInActiveRef.current) {
      scheduleNext()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.paceMs])

  useEffect(() => {
    const onVisibility = () => {
      // Skip auto-pause during prize-stop continue lead-in (focus flips are common).
      if (
        document.hidden &&
        statusRef.current === 'running' &&
        !leadInActiveRef.current
      ) {
        pause()
        setSaveNotice('Paused — window was hidden (safe for the draw)')
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pause])

  useEffect(
    () => () => {
      clearTimer()
      clearLeadIn()
    },
    [clearLeadIn, clearTimer],
  )

  return {
    config,
    applyConfig,
    commitTotalTickets,
    pool,
    remaining,
    insuredRemaining,
    insuredCount: insuredRemaining,
    insuranceMarks,
    eliminated,
    heldOut,
    preStartHeld,
    history,
    status,
    lastDrawn,
    flashKey,
    digits,
    maxTickets: MAX_TICKETS,
    start,
    pause,
    emergencyStop,
    safePaused,
    confirmSafeResume,
    resetSession,
    drawHasStarted,
    continueWithNewStop,
    setTicketInsured,
    clearAllInsurance,
    toggleTicketHold,
    drawOnce,
    saveNow,
    exportSaveFile,
    loadSaveFile,
    discardAutosave,
    lastSavedAt,
    saveNotice,
    // Audit / verification
    eventId: auditRef.current.eventId,
    auditEntries,
    seedCommitment,
    seedRevealed,
    revealAuditSeed,
    exportAuditPackage,
    getAuditEngine: () => auditRef.current,
  }
}

export type DrawSession = ReturnType<typeof useDrawSession>
