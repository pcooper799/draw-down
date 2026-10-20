import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

export function useDrawSession() {
  const [config, setConfig] = useState<SessionConfig>(DEFAULT_CONFIG)
  const [insuranceMarks, setInsuranceMarks] = useState<Set<number>>(() => new Set())
  const [pool, setPool] = useState<Ticket[]>(() => buildPool(DEFAULT_CONFIG.totalTickets, new Set()))
  const [eliminated, setEliminated] = useState<number[]>([])
  const [history, setHistory] = useState<DrawEvent[]>([])
  const [status, setStatus] = useState<DrawStatus>('idle')
  const [lastDrawn, setLastDrawn] = useState<DrawEvent | null>(null)
  const [flashKey, setFlashKey] = useState(0)

  const timerRef = useRef<number | null>(null)
  const poolRef = useRef(pool)
  const statusRef = useRef(status)
  const configRef = useRef(config)
  const insuranceRef = useRef(insuranceMarks)

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

  const setRangeInsured = useCallback(
    (from: number, to: number, insured: boolean) => {
      const lo = Math.min(from, to)
      const hi = Math.max(from, to)
      setInsuranceMarks((prev) => {
        const next = new Set(prev)
        for (let n = lo; n <= hi; n += 1) {
          if (n < 1 || n > configRef.current.totalTickets) continue
          if (insured) next.add(n)
          else next.delete(n)
        }
        syncInsuranceIntoPool(next)
        return next
      })
    },
    [syncInsuranceIntoPool],
  )

  const setPercentInsured = useCallback(
    (percent: number) => {
      const pct = Math.max(0, Math.min(100, percent))
      const total = configRef.current.totalTickets
      const count = Math.round((pct / 100) * total)
      const numbers = Array.from({ length: total }, (_, i) => i + 1)
      for (let i = numbers.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[numbers[i], numbers[j]] = [numbers[j], numbers[i]]
      }
      const next = new Set(numbers.slice(0, count))
      setInsuranceMarks(next)
      syncInsuranceIntoPool(next)
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
      // Drop insurance marks beyond new total
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

    if (!ticket.insured) {
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
  }, [config.paceMs]) // eslint-disable-line react-hooks/exhaustive-deps -- only reschedule on pace change

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
    setRangeInsured,
    setPercentInsured,
    clearAllInsurance,
    drawOnce,
  }
}

export type DrawSession = ReturnType<typeof useDrawSession>
