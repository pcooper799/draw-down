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
  onConfirm: (input: { operatorName: string; reason: string }) => void
}

export function ResetConfirmDialog({ open, onOpenChange, onConfirm }: Props) {
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setReason('')
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
    onConfirm({ operatorName, reason: why })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,420px)] gap-4">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            Confirm restart
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--ink-muted)]">
            This draw has already started. Restarting ends the current audit log and opens a new
            one for the next game. Your name and reason are recorded permanently.
          </DialogDescription>
        </DialogHeader>

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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
            />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={submit}>
            Restart draw
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
