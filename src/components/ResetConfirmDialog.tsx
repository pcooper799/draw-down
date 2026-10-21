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

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (input: {
    operatorName: string
    reason: string
    irreversibleConfirmed: true
  }) => void
}

export function ResetConfirmDialog({ open, onOpenChange, onConfirm }: Props) {
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setReason('')
    setConfirmed(false)
    setError(null)
  }, [open])

  const submit = () => {
    const operatorName = name.trim()
    const why = reason.trim()
    if (!operatorName) {
      setError('Enter your name.')
      return
    }
    if (!why) {
      setError('Enter a reason for the restart.')
      return
    }
    if (!confirmed) {
      setError('Check the box to confirm this cannot be undone.')
      return
    }
    onConfirm({ operatorName, reason: why, irreversibleConfirmed: true })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,440px)] gap-4">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            Confirm restart
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--ink-muted)]">
            This draw has already started. Restarting ends the current audit log and opens a new
            one for the next game. Your name, reason, and confirmation are recorded permanently.
          </DialogDescription>
        </DialogHeader>

        <div
          className="border border-[var(--danger)]/50 bg-[rgba(211,90,74,0.12)] px-3 py-3 text-sm text-[var(--danger)]"
          role="alert"
        >
          <p className="font-semibold">This cannot be undone.</p>
          <p className="mt-1 text-[var(--ink-muted)]">
            Are you sure you want to reset the board? Drawn tickets, insurance state, and this
            event’s live progress will be cleared. The audit history for this game is kept and
            closed — a new audit log starts for the next game.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="reset-operator-name">Your name</Label>
            <Input
              id="reset-operator-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              placeholder="Operator name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-reason">Why are you restarting?</Label>
            <Input
              id="reset-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setError(null)
              }}
              placeholder="e.g. Wrong ticket count entered"
            />
          </div>

          <label
            htmlFor="reset-irreversible"
            className="flex cursor-pointer items-start gap-2.5 border border-[var(--line)] bg-[var(--panel-elevated)]/80 px-3 py-2.5 text-sm text-[var(--ink)]"
          >
            <input
              id="reset-irreversible"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked)
                setError(null)
              }}
              className="mt-0.5 size-4 shrink-0 accent-[var(--danger)]"
            />
            <span>
              <span className="font-semibold">Yes</span> — I understand this cannot be undone and I
              want to reset the board.
            </span>
          </label>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={submit} disabled={!confirmed}>
            Reset the board
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
