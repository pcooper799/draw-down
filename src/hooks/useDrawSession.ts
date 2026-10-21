import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  canInsureTicket,
  clampPaceMs,
  clampStopAt,
  clampTotalTickets,
  MAX_TICKETS,
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

function buildPool(total: number, insured: Set<number>): Ticket[] {
  return Array.from({ length: total }, (_, i) => {
    const number = i + 1
    return { number, insured: insured.has(number) }
  })
}

function hydrateFromSnapshot(snapshot: SessionSnapshot) {
  const total = clampTotalTickets(snapshot.config.totalTickets, snapshot.config.stopAt)
  const stopAt = clampStopAt(snapshot.config.stopAt, total)
  const config: SessionConfig = {
    ...snapshot.config,
    totalTickets: total,
    stopAt,
    paceMs: clampPaceMs(snapshot.config.paceMs),
  }
  const eliminated = snapshot.eliminated.filter((n) => n >= 1 && n <= total)
  const marks = pruneInsuranceMarks(snapshot.insuranceMarks, total, eliminated)
  return {
    config,
    insuranceMarks: marks,
    pool: buildPoolFromSnapshot(total, eliminated, marks),
    eliminated,
    history: snapshot.history,
    lastDrawn: snapshot.lastDrawn,
    status: snapshot.status as DrawStatus,
  }
}

export function useDrawSession() {
  const initial = useMemo(() => {
    const saved = typeof window !== 'undefined' ? readAutosave() : null
    if (saved) return { ...hydrateFromSnapshot(saved), restoredAt: saved.savedAt }
    return {
      config: DEFAULT_CONFIG,
      insuranceMarks: new Set<number>(),
      pool: buildPool(DEFAULT_CONFIG.totalTickets, new Set()),
      eliminated: [] as number[],
      history: [] as DrawEvent[],
      lastDrawn: null as DrawEvent | null,
      status: 'idle' as DrawStatus,
      restoredAt: null as string | null,
    }
  }, [])

  const [config, setConfig] = useState<SessionConfig>(initial.config)
  const [insuranceMarks, setInsuranceMarks] = useState<Set<number>>(() => initial.insuranceMarks)
  const [pool, setPool] = useState<Ticket[]>(() => initial.pool)
  const [eliminated, setEliminated] = useState<number[]>(() => initial.eliminated)
  const [history, setHistory] = useState<DrawEvent[]>(() => initial.history)
  const [status, setStatus] = useState<DrawStatus>(initial.status)
  const [lastDrawn, setLastDrawn] = useState<DrawEvent | null>(initial.lastDrawn)
  const [flashKey, setFlashKey] = useState(0)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initial.restoredAt)
  const [saveNotice, setSaveNotice] = useState<string | null>(
    initial.restoredAt ? 'Restored previous session' : null,
  )

  const timerRef = useRef<number | null>(null)
  const poolRef = useRef(pool)
  const statusRef = useRef(status)
  const configRef = useRef(config)
  const insuranceRef = useRef(insuranceMarks)
  const eliminatedRef = useRef(eliminated)
  const historyRef = useRef(history)
  const lastDrawnRef = useRef(lastDrawn)
  const readyToAutosave = useRef(false)
  /** Prevents overlapping start()/draw scheduling from key repeat or double-clicks. */
  const drawLockRef = useRef(false)

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

  const remaining = pool.length
  const insuredRemaining = useMemo(() => pool.filter((t) => t.insured).length, [pool])
  const digits = String(Math.max(config.totalTickets, 1)).length

  const applyConfig = useCallback((next: Partial<SessionConfig>) => {
    setConfig((prev) => {
      const merged = { ...prev, ...next }
      merged.stopAt = clampStopAt(merged.stopAt, merged.totalTickets)
      merged.totalTickets = clampTotalTickets(merged.totalTickets, merged.stopAt)
      merged.stopAt = clampStopAt(merged.stopAt, merged.totalTickets)
      merged.paceMs = clampPaceMs(merged.paceMs)
      if (!merged.orgName?.trim()) merged.orgName = prev.orgName
      configRef.current = merged
      return merged
    })
  }, [])

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
      if (insured && !canInsureTicket(ticket, configRef.current.totalTickets, eliminatedRef.current)) {
        setSaveNotice('That ticket is already out — cannot insure it')
        return
      }
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
    },
    [syncInsuranceIntoPool],
  )

  const clearAllInsurance = useCallback(() => {
    if (statusRef.current === 'running') return
    const empty = new Set<number>()
    insuranceRef.current = empty
    setInsuranceMarks(empty)
    syncInsuranceIntoPool(empty)
  }, [syncInsuranceIntoPool])

  const rebuildPool = useCallback(
    (total: number, marks: Set<number> = insuranceRef.current) => {
      clearTimer()
      drawLockRef.current = false
      const safeTotal = clampTotalTickets(total, configRef.current.stopAt)
      const pruned = pruneInsuranceMarks(marks, safeTotal, [])
      const nextPool = buildPool(safeTotal, pruned)
      poolRef.current = nextPool
      eliminatedRef.current = []
      historyRef.current = []
      lastDrawnRef.current = null
      statusRef.current = 'idle'
      insuranceRef.current = pruned
      setPool(nextPool)
      setEliminated([])
      setHistory([])
      setLastDrawn(null)
      setStatus('idle')
      setInsuranceMarks(pruned)
    },
    [clearTimer],
  )

  const commitTotalTickets = useCallback(
    (total: number) => {
      if (statusRef.current === 'running') return
      const stopAt = configRef.current.stopAt
      const safe = clampTotalTickets(total, stopAt)
      applyConfig({ totalTickets: safe })
      setInsuranceMarks((prev) => {
        const next = pruneInsuranceMarks(prev, safe, [])
        insuranceRef.current = next
        rebuildPool(safe, next)
        return next
      })
    },
    [applyConfig, rebuildPool],
  )

  const resetSession = useCallback(() => {
    if (statusRef.current === 'running') {
      clearTimer()
    }
    rebuildPool(configRef.current.totalTickets, insuranceRef.current)
    setSaveNotice('Session reset')
  }, [rebuildPool, clearTimer])

  const captureSnapshot = useCallback((): SessionSnapshot => {
    return toSnapshot({
      config: configRef.current,
      insuranceMarks: insuranceRef.current,
      eliminated: eliminatedRef.current,
      history: historyRef.current,
      lastDrawn: lastDrawnRef.current,
      status: statusRef.current,
    })
  }, [])

  const applySnapshot = useCallback(
    (snapshot: SessionSnapshot, notice: string) => {
      clearTimer()
      drawLockRef.current = false
      const hydrated = hydrateFromSnapshot(snapshot)
      configRef.current = hydrated.config
      insuranceRef.current = hydrated.insuranceMarks
      poolRef.current = hydrated.pool
      eliminatedRef.current = hydrated.eliminated
      historyRef.current = hydrated.history
      lastDrawnRef.current = hydrated.lastDrawn
      statusRef.current = hydrated.status
      setConfig(hydrated.config)
      setInsuranceMarks(hydrated.insuranceMarks)
      setPool(hydrated.pool)
      setEliminated(hydrated.eliminated)
      setHistory(hydrated.history)
      setLastDrawn(hydrated.lastDrawn)
      setStatus(hydrated.status)
      setLastSavedAt(snapshot.savedAt)
      writeAutosave(
        toSnapshot({
          config: hydrated.config,
          insuranceMarks: hydrated.insuranceMarks,
          eliminated: hydrated.eliminated,
          history: hydrated.history,
          lastDrawn: hydrated.lastDrawn,
          status: hydrated.status,
        }),
      )
      setSaveNotice(notice)
    },
    [clearTimer],
  )

  const saveNow = useCallback(() => {
    const snapshot = captureSnapshot()
    writeAutosave(snapshot)
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

  // Debounced autosave whenever live state changes
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
    history,
    lastDrawn,
    status,
    pool,
    captureSnapshot,
  ])

  // Persist immediately if the window is closing / refreshing mid-event
  useEffect(() => {
    const flush = () => {
      writeAutosave(captureSnapshot())
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [captureSnapshot])

  const drawOnce = useCallback(() => {
    const currentPool = poolRef.current
    const cfg = configRef.current
    if (currentPool.length === 0 || currentPool.length <= cfg.stopAt) {
      statusRef.current = 'finished'
      setStatus('finished')
      clearTimer()
      drawLockRef.current = false
      return
    }

    const index = Math.floor(Math.random() * currentPool.length)
    const ticket = currentPool[index]
    if (!ticket) {
      clearTimer()
      return
    }

    const event: DrawEvent = {
      id: `${Date.now()}-${ticket.number}-${Math.random().toString(36).slice(2, 7)}`,
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
      const nextPool = currentPool.map((t) =>
        t.number === ticket.number ? { ...t, insured: false } : t,
      )
      poolRef.current = nextPool
      setPool(nextPool)
    } else {
      const nextPool = currentPool.filter((t) => t.number !== ticket.number)
      poolRef.current = nextPool
      setPool(nextPool)
      setEliminated((prev) => {
        const next = [ticket.number, ...prev]
        eliminatedRef.current = next
        // Drop any stale insurance mark for tickets that are now out
        if (insuranceRef.current.has(ticket.number)) {
          const marks = new Set(insuranceRef.current)
          marks.delete(ticket.number)
          insuranceRef.current = marks
          setInsuranceMarks(marks)
        }
        return next
      })
      if (nextPool.length <= cfg.stopAt) {
        statusRef.current = 'finished'
        setStatus('finished')
        clearTimer()
        drawLockRef.current = false
      }
    }
  }, [clearTimer])

  const scheduleNext = useCallback(() => {
    clearTimer()
    if (statusRef.current !== 'running') return
    if (poolRef.current.length <= configRef.current.stopAt) {
      statusRef.current = 'finished'
      setStatus('finished')
      drawLockRef.current = false
      return
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (statusRef.current !== 'running') return
      drawOnce()
      if (statusRef.current === 'running' && poolRef.current.length > configRef.current.stopAt) {
        scheduleNext()
      } else {
        drawLockRef.current = false
      }
    }, configRef.current.paceMs)
  }, [clearTimer, drawOnce])

  const start = useCallback(() => {
    if (statusRef.current === 'running' || drawLockRef.current) return
    if (poolRef.current.length <= configRef.current.stopAt) {
      statusRef.current = 'finished'
      setStatus('finished')
      return
    }
    drawLockRef.current = true
    statusRef.current = 'running'
    setStatus('running')
    drawOnce()
    if (statusRef.current === 'running' && poolRef.current.length > configRef.current.stopAt) {
      scheduleNext()
    } else {
      drawLockRef.current = false
    }
  }, [drawOnce, scheduleNext])

  const pause = useCallback(() => {
    clearTimer()
    drawLockRef.current = false
    if (statusRef.current === 'running') {
      statusRef.current = 'paused'
      setStatus('paused')
      // Flush save so a crash after pause is recoverable
      writeAutosave(
        toSnapshot({
          config: configRef.current,
          insuranceMarks: insuranceRef.current,
          eliminated: eliminatedRef.current,
          history: historyRef.current,
          lastDrawn: lastDrawnRef.current,
          status: 'paused',
        }),
      )
    }
  }, [clearTimer])

  // Live pace edits while drawing: reschedule with the new interval (no double timers)
  useEffect(() => {
    if (statusRef.current === 'running') {
      scheduleNext()
    }
    // Only re-run when pace changes — not when scheduleNext identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.paceMs])

  // Auto-pause if the window/tab is hidden — browsers throttle timers and skip draws
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && statusRef.current === 'running') {
        pause()
        setSaveNotice('Paused — window was hidden (safe for the draw)')
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pause])

  useEffect(() => () => clearTimer(), [clearTimer])

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
    history,
    status,
    lastDrawn,
    flashKey,
    digits,
    maxTickets: MAX_TICKETS,
    start,
    pause,
    resetSession,
    setTicketInsured,
    clearAllInsurance,
    drawOnce,
    saveNow,
    exportSaveFile,
    loadSaveFile,
    discardAutosave,
    lastSavedAt,
    saveNotice,
  }
}

export type DrawSession = ReturnType<typeof useDrawSession>
