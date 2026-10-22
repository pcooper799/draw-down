import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatTicket } from '@/lib/utils'
import type { DrawEvent, Ticket } from '@/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgName: string
  brandImageDataUrl: string | null
  pool: Ticket[]
  lastDrawn: DrawEvent | null
  digits: number
  stopAt: number
  /** When true, hide continue-to-next-stop (expired license / review mode). */
  drawLocked?: boolean
  onContinueWithStop: (stopAt: number) => boolean
  onResumeDraw: () => void
}

/** Operator-window stop dialog with next-stop / continue controls. Stage uses StageStopCelebration. */
export function FinishCelebration({
  open,
  onOpenChange,
  orgName,
  brandImageDataUrl,
  pool,
  lastDrawn,
  digits,
  stopAt,
  drawLocked = false,
  onContinueWithStop,
  onResumeDraw,
}: Props) {
  const remainingCount = pool.length
  const lastTicket = lastDrawn?.ticket ?? null
  const wasReturned = lastDrawn?.outcome === 'returned'
  const wasOut = lastDrawn?.outcome === 'eliminated'
  const hasMoreTickets = remainingCount > 1
  const canContinue = hasMoreTickets && !drawLocked
  const maxNextStop = Math.max(1, remainingCount - 1)
  const defaultNext = Math.min(stopAt > 0 ? Math.min(stopAt, maxNextStop) : 1, maxNextStop)
  const [nextStopDraft, setNextStopDraft] = useState(String(defaultNext))
  const [continueError, setContinueError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNextStopDraft(String(Math.min(Math.max(1, stopAt === remainingCount ? 1 : stopAt), maxNextStop)))
    setContinueError(null)
  }, [open, stopAt, remainingCount, maxNextStop])

  const handleContinueDraw = () => {
    const parsed = Number.parseInt(nextStopDraft, 10)
    if (!Number.isFinite(parsed)) {
      setContinueError('Enter a valid stop number')
      return
    }
    const next = Math.floor(parsed)
    if (next < 1 || next > maxNextStop) {
      setContinueError(`Stop must be between 1 and ${maxNextStop}`)
      return
    }
    const ok = onContinueWithStop(next)
    if (!ok) {
      setContinueError(`Need a stop below ${remainingCount} remaining`)
      return
    }
    onOpenChange(false)
    onResumeDraw()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="finish-dialog w-[min(94vw,640px)] gap-5 border-[var(--accent)]/35 p-0 overflow-hidden">
        <div className="finish-dialog-banner px-6 pt-6 pb-4">
          {brandImageDataUrl && (
            <img
              src={brandImageDataUrl}
              alt=""
              className="mx-auto mb-4 max-h-28 w-auto object-contain finish-brand-pop"
            />
          )}
          <DialogHeader className="items-center text-center sm:text-center">
            <DialogTitle className="font-display text-3xl tracking-wide text-[var(--accent)] sm:text-4xl">
              {hasMoreTickets ? 'Stop reached' : 'Draw complete'}
            </DialogTitle>
            <DialogDescription className="text-base text-[var(--ink-muted)]">
              {orgName} ·{' '}
              {drawLocked && hasMoreTickets
                ? 'prize break — enter a new code to continue the draw'
                : canContinue
                  ? 'prize break — continue when ready'
                  : 'last ticket drawn'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 pb-6">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ink-faint)]">
              Last drawn
            </p>
            {lastTicket != null ? (
              <>
                <p
                  className={`finish-winner-number font-display mt-3 text-[clamp(3.5rem,14vw,6.5rem)] leading-none tracking-wide ${
                    wasReturned
                      ? 'text-[var(--safe)]'
                      : wasOut
                        ? 'text-[var(--danger)]'
                        : 'text-[var(--accent)]'
                  }`}
                >
                  {formatTicket(lastTicket, digits)}
                </p>
                <p className="mt-3 text-sm font-semibold uppercase tracking-[0.16em]">
                  {wasReturned ? (
                    <span className="text-[var(--safe)]">Returned · insurance used</span>
                  ) : wasOut ? (
                    <span className="text-[var(--danger)]">Out</span>
                  ) : (
                    <span className="text-[var(--ink-muted)]">Drawn</span>
                  )}
                </p>
              </>
            ) : (
              <p className="mt-3 font-display text-4xl text-[var(--ink-muted)]">—</p>
            )}
          </div>

          <p className="text-center text-sm text-[var(--ink-muted)]">
            {remainingCount} ticket{remainingCount === 1 ? '' : 's'} still in the draw
            {hasMoreTickets ? ` · stopped at ${stopAt}` : ''}
          </p>

          {drawLocked && hasMoreTickets && (
            <p className="border border-[var(--danger)]/40 bg-[rgba(211,90,74,0.1)] px-3 py-2 text-center text-sm text-[var(--danger)]">
              License expired — you can close this and use Audit & verification. Enter a new code to
              resume the live draw.
            </p>
          )}

          {canContinue && (
            <div className="space-y-3 border border-[var(--line)] bg-[var(--panel-elevated)]/80 p-3">
              <div className="space-y-2">
                <Label htmlFor="next-stop">Next stop when remaining</Label>
                <Input
                  id="next-stop"
                  inputMode="numeric"
                  value={nextStopDraft}
                  onChange={(e) => {
                    setNextStopDraft(e.target.value)
                    setContinueError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleContinueDraw()
                    }
                  }}
                />
                <p className="text-xs text-[var(--ink-faint)]">
                  For the next prize tier. Must be 1–{maxNextStop} (below current remaining). After
                  Continue, the stage waits a few seconds before the next ticket.
                </p>
                {continueError && (
                  <p className="text-xs text-[var(--danger)]">{continueError}</p>
                )}
              </div>
              <Button type="button" className="w-full" size="lg" onClick={handleContinueDraw}>
                Continue draw to that stop
              </Button>
            </div>
          )}

          <Button
            type="button"
            variant={canContinue ? 'secondary' : 'default'}
            className="w-full"
            size="lg"
            onClick={() => onOpenChange(false)}
          >
            {canContinue ? 'Stay stopped for now' : drawLocked && hasMoreTickets ? 'Close' : 'Continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Opens automatically once when status becomes finished; closes after reset/continue. */
export function useFinishCelebration(status: string) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (status === 'finished') setOpen(true)
    else setOpen(false)
  }, [status])

  return { open, setOpen }
}
