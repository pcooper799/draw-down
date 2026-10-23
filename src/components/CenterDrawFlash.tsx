import { useEffect, useRef, useState } from 'react'
import { formatTicket } from '@/lib/utils'
import type { DrawEvent } from '@/types'

const FLASH_MS = 1600

/**
 * Full-stage center flash when a ticket is drawn.
 * Distinct motion for eliminated vs insurance-saved returns.
 *
 * Triggered by flashKey (increments on each real draw). If the operator window
 * restarts and flashKey goes back to 0 while the stage stays open, we reset the
 * seen-key guard so new draws flash again.
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
  const [event, setEvent] = useState<DrawEvent | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const seenKeyRef = useRef(0)

  useEffect(() => {
    // Operator remount / new session often restarts flashKey at 0 while the
    // stage window keeps a high seen-key from the previous run.
    if (flashKey < seenKeyRef.current) {
      seenKeyRef.current = 0
    }
    if (flashKey <= 0) return
    if (flashKey <= seenKeyRef.current) return
    if (!lastDrawn) return

    seenKeyRef.current = flashKey
    setEvent(lastDrawn)
    setAnimKey(flashKey)
  }, [flashKey, lastDrawn])

  useEffect(() => {
    if (!event) return
    const id = window.setTimeout(() => setEvent(null), FLASH_MS)
    return () => window.clearTimeout(id)
  }, [event, animKey])

  if (!event) return null

  const saved = event.outcome === 'returned'

  return (
    <div
      key={animKey}
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
