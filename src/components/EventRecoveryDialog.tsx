import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { RecoveryCandidate } from '@/lib/audit/recoveryDiscover'

type Props = {
  open: boolean
  candidate: RecoveryCandidate | null
  /** Live drawing allowed (active license or DEV). */
  liveDrawAllowed: boolean
  busy?: boolean
  error?: string | null
  onRestore: () => void
  onReviewAudit: () => void
  onDiscard: () => void
  onDismiss: () => void
}

export function EventRecoveryDialog({
  open,
  candidate,
  liveDrawAllowed,
  busy = false,
  error = null,
  onRestore,
  onReviewAudit,
  onDiscard,
  onDismiss,
}: Props) {
  if (!candidate) return null
  const r = candidate.reconstructed
  const verifyOk = r.verify.ok
  const lastTicket = r.lastCommittedTicket
  const recoveredAt = r.snapshot.savedAt

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onDismiss()
      }}
    >
      <DialogContent className="w-[min(92vw,520px)]" hideClose={busy}>
        <DialogHeader>
          <DialogTitle>Event recovery available</DialogTitle>
          <DialogDescription>
            A durable audit on this PC has committed draws that are ahead of the local session.
            Restore to continue from the last verified state — drawing will stay paused.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 border border-[var(--line)] bg-black/25 px-3 py-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Organization</span>
            <span className="text-right font-medium">{r.snapshot.config.orgName}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Event ID</span>
            <span className="break-all text-right font-mono text-xs">{candidate.eventId}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Committed draws</span>
            <span className="font-mono">{r.drawCount}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Last committed ticket</span>
            <span className="font-mono">{lastTicket != null ? `#${lastTicket}` : '—'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Remaining</span>
            <span className="font-mono">{r.remaining}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Stop at</span>
            <span className="font-mono">{r.snapshot.config.stopAt}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Audit verification</span>
            <span className={verifyOk ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}>
              {verifyOk ? 'PASS' : 'FAIL'}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Recovery timestamp</span>
            <span className="text-right text-xs">
              {recoveredAt ? new Date(recoveredAt).toLocaleString() : '—'}
            </span>
          </div>
          <p className="pt-1 text-xs text-[var(--ink-faint)]">{candidate.reason}</p>
          {!r.hasLocalSeed && (
            <p className="text-xs text-[var(--danger)]">
              Local draw seed missing from durable blob — restore allows review/export only until a
              new event is started.
            </p>
          )}
          {!liveDrawAllowed && (
            <p className="text-xs text-[var(--accent)]">
              License expired or inactive — you can restore to review/export, but live drawing stays
              locked.
            </p>
          )}
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </div>

        <DialogFooter className="mt-1 flex flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            disabled={busy || !verifyOk}
            onClick={onRestore}
            title={!verifyOk ? 'Audit verification failed — restore blocked' : undefined}
          >
            Restore event (paused)
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onReviewAudit}>
            Review audit
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onDiscard}>
            Discard recovery prompt…
          </Button>
          <p className="text-[0.65rem] text-[var(--ink-faint)]">
            Discard only hides this prompt. The durable audit file is archived, not deleted.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
