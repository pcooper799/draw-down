import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const marks = new Set(snapshot.insuranceMarks)
  return {
    config: snapshot.config,
    insuranceMarks: marks,
    pool: buildPoolFromSnapshot(snapshot.config.totalTickets, snapshot.eliminated, marks),
    eliminated: snapshot.eliminated,
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
      if (merged.stopAt < 1) merged.stopAt = 1
      if (merged.totalTickets < 1) merged.totalTickets = 1
      if (merged.totalTickets < merged.stopAt) merged.totalTickets = merged.stopAt
      if (merged.paceMs < 200) merged.paceMs = 200
      if (merged.paceMs > 60_000) merged.paceMs = 60_000
      return merged
    })
  }, [])

  const syncInsuranceIntoPool = useCallback((marks: Set<number>) => {
    setPool((prev) => prev.map((t) => ({ ...t, insured: marks.has(t.number) })))
  }, [])

  const setTicketInsured = useCallback(
    (ticket: number, insured: boolean) => {
      setInsuranceMarks((prev) => {
        const next = new Set(prev)
        if (insured) next.add(ticket)
        else next.delete(ticket)
        syncInsuranceIntoPool(next)
        return next
      })
    },
    [syncInsuranceIntoPool],
  )

  const clearAllInsurance = useCallback(() => {
    const empty = new Set<number>()
    setInsuranceMarks(empty)
    syncInsuranceIntoPool(empty)
  }, [syncInsuranceIntoPool])

  const rebuildPool = useCallback(
    (total: number, marks: Set<number> = insuranceRef.current) => {
      clearTimer()
      const safeTotal = Math.max(1, total)
      setPool(buildPool(safeTotal, marks))
      setEliminated([])
      setHistory([])
      setLastDrawn(null)
      setStatus('idle')
    },
    [clearTimer],
  )

  const commitTotalTickets = useCallback(
    (total: number) => {
      const stopAt = configRef.current.stopAt
      const safe = Math.max(stopAt, Math.max(1, total))
      applyConfig({ totalTickets: safe })
      setInsuranceMarks((prev) => {
        const next = new Set([...prev].filter((n) => n <= safe))
        rebuildPool(safe, next)
        return next
      })
    },
    [applyConfig, rebuildPool],
  )

  const resetSession = useCallback(() => {
    rebuildPool(configRef.current.totalTickets, insuranceRef.current)
  }, [rebuildPool])

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
      const hydrated = hydrateFromSnapshot(snapshot)
      setConfig(hydrated.config)
      setInsuranceMarks(hydrated.insuranceMarks)
      insuranceRef.current = hydrated.insuranceMarks
      setPool(hydrated.pool)
      poolRef.current = hydrated.pool
      setEliminated(hydrated.eliminated)
      setHistory(hydrated.history)
      setLastDrawn(hydrated.lastDrawn)
      setStatus(hydrated.status)
      statusRef.current = hydrated.status
      setLastSavedAt(snapshot.savedAt)
      writeAutosave(snapshot)
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
      const snapshot = await readSnapshotFromFile(file)
      if (!snapshot) {
        setSaveNotice('Could not read that save file')
        return false
      }
      applySnapshot(snapshot, 'Loaded save file')
      return true
    },
    [applySnapshot],
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

  const drawOnce = useCallback(() => {
    const currentPool = poolRef.current
    const cfg = configRef.current
    if (currentPool.length <= cfg.stopAt) {
      statusRef.current = 'finished'
      setStatus('finished')
      clearTimer()
      return
    }

    const index = Math.floor(Math.random() * currentPool.length)
    const ticket = currentPool[index]
    const event: DrawEvent = {
      id: `${Date.now()}-${ticket.number}-${Math.random().toString(36).slice(2, 7)}`,
      ticket: ticket.number,
      insured: ticket.insured,
      outcome: ticket.insured ? 'returned' : 'eliminated',
      at: Date.now(),
    }

    setLastDrawn(event)
    setFlashKey((k) => k + 1)
    setHistory((h) => [event, ...h].slice(0, 50))

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
      setEliminated((prev) => [ticket.number, ...prev])
      if (nextPool.length <= cfg.stopAt) {
        statusRef.current = 'finished'
        setStatus('finished')
        clearTimer()
      }
    }
  }, [clearTimer])

  const scheduleNext = useCallback(() => {
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      if (statusRef.current !== 'running') return
      drawOnce()
      if (statusRef.current === 'running' && poolRef.current.length > configRef.current.stopAt) {
        scheduleNext()
      }
    }, configRef.current.paceMs)
  }, [clearTimer, drawOnce])

  const start = useCallback(() => {
    if (poolRef.current.length <= configRef.current.stopAt) {
      setStatus('finished')
      return
    }
    setStatus('running')
    statusRef.current = 'running'
    drawOnce()
    if (statusRef.current === 'running' && poolRef.current.length > configRef.current.stopAt) {
      scheduleNext()
    }
  }, [drawOnce, scheduleNext])

  const pause = useCallback(() => {
    clearTimer()
    setStatus((s) => (s === 'running' ? 'paused' : s))
  }, [clearTimer])

  useEffect(() => {
    if (status === 'running') scheduleNext()
  }, [config.paceMs]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimer(), [clearTimer])

  return {
    config,
    applyConfig,
    commitTotalTickets,
    pool,
    remaining,
    insuredRemaining,
    insuredCount: insuranceMarks.size,
    insuranceMarks,
    eliminated,
    history,
    status,
    lastDrawn,
    flashKey,
    digits,
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
