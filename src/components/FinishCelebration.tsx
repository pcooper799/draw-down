import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
}

export function FinishCelebration({
  open,
  onOpenChange,
  orgName,
  brandImageDataUrl,
  pool,
  lastDrawn,
  digits,
}: Props) {
  const winners = [...pool].map((t) => t.number).sort((a, b) => a - b)
  const lastOut =
    lastDrawn?.outcome === 'eliminated' ? lastDrawn.ticket : null
  const single = winners.length === 1

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
              {single ? 'Winner' : 'Remaining tickets'}
            </DialogTitle>
            <DialogDescription className="text-base text-[var(--ink-muted)]">
              {orgName} · draw complete
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 pb-6">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ink-faint)]">
              {single ? 'Ticket still in' : `${winners.length} tickets still in`}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              {winners.map((n) => (
                <span
                  key={n}
                  className="finish-winner-number font-display text-[clamp(2.75rem,10vw,5.5rem)] leading-none tracking-wide text-[var(--accent)]"
                >
                  {formatTicket(n, digits)}
                </span>
              ))}
            </div>
          </div>

          {lastOut != null && (
            <div className="finish-last-out px-4 py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                Last drawn out
              </p>
              <p className="font-display mt-1 text-4xl tracking-wide text-[var(--danger)] sm:text-5xl">
                {formatTicket(lastOut, digits)}
              </p>
            </div>
          )}

          <Button type="button" className="w-full" size="lg" onClick={() => onOpenChange(false)}>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Opens automatically once when status becomes finished; closes after reset. */
export function useFinishCelebration(status: string) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (status === 'finished') setOpen(true)
    else setOpen(false)
  }, [status])

  return { open, setOpen }
}
