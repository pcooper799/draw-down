import { useEffect, useRef, useState } from 'react'
import { formatTicket } from '@/lib/utils'
import type { DrawEvent } from '@/types'

const FLASH_MS = 1600

/**
 * Full-stage center flash when a ticket is drawn.
 * Distinct motion for eliminated vs insurance-saved returns.
 * Triggered only by flashKey (a real draw) — never by lastDrawn identity churn
 * while paused / emergency-stopped / idle.
 */
export function CenterDrawFlash({
  lastDrawn,
  flashKey,
  digits,
}: {
  lastDrawn: DrawEvent | null
  flashKey: number
  digits: number
}) {
  const [visible, setVisible] = useState(false)
  const [event, setEvent] = useState<DrawEvent | null>(null)
  const lastDrawnRef = useRef(lastDrawn)
  lastDrawnRef.current = lastDrawn
  const seenKeyRef = useRef(0)

  useEffect(() => {
    if (flashKey === 0) return
    // Ignore duplicate / stale keys (bridge republish, remount with same key).
    if (flashKey <= seenKeyRef.current) return
    const drawn = lastDrawnRef.current
    if (!drawn) return

    seenKeyRef.current = flashKey
    setEvent(drawn)
    setVisible(true)
    const id = window.setTimeout(() => setVisible(false), FLASH_MS)
    return () => window.clearTimeout(id)
  }, [flashKey])

  if (!visible || !event) return null

  const saved = event.outcome === 'returned'

  return (
    <div
      className={`center-draw-flash center-draw-flash--${saved ? 'saved' : 'out'}`}
      role="status"
      aria-live="assertive"
      aria-label={
        saved
          ? `Ticket ${event.ticket} saved by insurance`
          : `Ticket ${event.ticket} eliminated`
      }
    >
      <div className="center-draw-flash-burst" aria-hidden />
      <div className="center-draw-flash-card">
        <p className="text-[0.75rem] font-semibold uppercase tracking-[0.28em] text-[var(--ink-faint)]">
          {saved ? 'Insurance saved' : 'Eliminated'}
        </p>
        <p className="center-draw-flash-number font-display">
          {formatTicket(event.ticket, digits)}
        </p>
        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em]">
          {saved ? 'Back in the draw' : 'Out of the draw'}
        </p>
      </div>
    </div>
  )
}
