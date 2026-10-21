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
  const remainingCount = pool.length
  const lastTicket = lastDrawn?.ticket ?? null
  const wasReturned = lastDrawn?.outcome === 'returned'
  const wasOut = lastDrawn?.outcome === 'eliminated'

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
              Draw complete
            </DialogTitle>
            <DialogDescription className="text-base text-[var(--ink-muted)]">
              {orgName} · last ticket drawn
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
          </p>

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
