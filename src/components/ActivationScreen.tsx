import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { activateLicenseCode, formatRemaining, type LicenseStatus } from '@/lib/license'

type Props = {
  status: LicenseStatus
  onActivated: () => void
}

export function ActivationScreen({ status, onActivated }: Props) {
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

  return (
    <div className="activation-screen relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="activation-glow" aria-hidden />
      <div className="relative z-10 w-full max-w-md border border-[var(--line)] bg-[rgba(12,18,16,0.94)] p-6 shadow-2xl backdrop-blur-md sm:p-8">
        <div className="mx-auto mb-5 h-32 w-32 overflow-hidden border border-red-500/35 bg-black shadow-[0_0_40px_rgba(220,40,40,0.25)]">
          <img src="/app-icon.png" alt="Draw Down" className="h-full w-full object-cover" />
        </div>

        <div className="text-center">
          <p className="font-display text-3xl tracking-wide text-[var(--ink)]">DRAW DOWN</p>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Paid event license · 48 hours of use per activation code
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
            placeholder="DD1.xxxxx.yyyyy"
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
          Enter the code you purchased. Access starts when you activate and lasts 48 hours on this
          computer.
        </p>
      </div>
    </div>
  )
}

export function LicenseBadge({ status }: { status: LicenseStatus }) {
  if (status.state !== 'active') return null
  return (
    <p className="text-[0.65rem] text-[var(--ink-faint)]">
      License · {formatRemaining(status.remainingMs)} left
    </p>
  )
}
