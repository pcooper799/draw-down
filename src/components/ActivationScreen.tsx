import { useState } from 'react'
import { KeyRound, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { activateLicenseCode, formatRemaining, type LicenseStatus } from '@/lib/license'

type Props = {
  status: LicenseStatus
  onActivated: () => void
  /** Full-screen gate (default) or modal over a preserved live session. */
  variant?: 'page' | 'overlay'
  onDismiss?: () => void
}

export function ActivationScreen({
  status,
  onActivated,
  variant = 'page',
  onDismiss,
}: Props) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expired =
    status.state === 'expired'
      ? `Previous access ended ${new Date(status.expiresAt).toLocaleString()}.`
      : null

  const submit = async () => {
    setBusy(true)
    setError(null)
    const result = await activateLicenseCode(code)
    setBusy(false)
    if (!result.ok) {
      setError(result.reason)
      return
    }
    onActivated()
  }

  const card = (
    <div className="relative z-10 w-full max-w-md border border-[var(--line)] bg-[rgba(12,18,16,0.96)] p-6 shadow-2xl backdrop-blur-md sm:p-8">
      {variant === 'overlay' && onDismiss && (
        <button
          type="button"
          className="absolute right-3 top-3 text-[var(--ink-faint)] hover:text-[var(--ink)]"
          onClick={onDismiss}
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      )}

      <div className="mx-auto mb-5 h-32 w-32 overflow-hidden border border-red-500/35 bg-black shadow-[0_0_40px_rgba(220,40,40,0.25)]">
        <img src="/app-icon.png" alt="Draw Down" className="h-full w-full object-cover" />
      </div>

      <div className="text-center">
        <p className="font-display text-3xl tracking-wide text-[var(--ink)]">DRAW DOWN</p>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          {variant === 'overlay'
            ? 'Enter a new code to start or resume a live draw. Audit logs and verification stay available without renewing.'
            : 'Paid event license · 48 hours of live drawing per activation code'}
        </p>
      </div>

      {expired && (
        <p className="mt-4 border border-[var(--danger)]/40 bg-[rgba(211,90,74,0.12)] px-3 py-2 text-sm text-[var(--danger)]">
          {expired}
        </p>
      )}

      <div className="mt-6 space-y-3">
        <Label htmlFor="license-code">Activation code</Label>
        <Input
          id="license-code"
          value={code}
          autoFocus
          spellCheck={false}
          placeholder="DD2.xxxxx.yyyyy"
          className="font-mono text-sm"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <Button
          type="button"
          className="w-full"
          size="lg"
          disabled={busy || !code.trim()}
          onClick={() => void submit()}
        >
          <KeyRound />
          {busy ? 'Checking…' : 'Activate 48-hour access'}
        </Button>
      </div>

      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-[var(--ink-faint)]">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--safe)]" />
        {variant === 'overlay'
          ? 'Your board, session, and audit history stay on this computer. Close this to keep reviewing without renewing.'
          : 'Enter the code you purchased. Live drawing is unlocked for 48 hours from activation. After that you can still open past events to verify and export reports.'}
      </p>
    </div>
  )

  if (variant === 'overlay') {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-10 backdrop-blur-sm">
        <div className="activation-glow pointer-events-none absolute inset-0" aria-hidden />
        {card}
      </div>
    )
  }

  return (
    <div className="activation-screen relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="activation-glow" aria-hidden />
      {card}
    </div>
  )
}

export function LicenseBadge({ status }: { status: LicenseStatus }) {
  if (status.state === 'expired') {
    return (
      <p className="text-[0.65rem] text-[var(--danger)]">
        Expired · review mode (draws locked)
      </p>
    )
  }
  if (status.state !== 'active') return null
  const until = new Date(status.expiresAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return (
    <p className="text-[0.65rem] text-[var(--ink-faint)]" title={`Expires ${status.expiresAt}`}>
      License · {formatRemaining(status.remainingMs)} left · until {until}
    </p>
  )
}
