import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  ImagePlus,
  XCircle,
} from 'lucide-react'
import { InsuranceManager } from '@/components/InsuranceManager'
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
import { Slider } from '@/components/ui/slider'
import {
  MAX_TICKET_SCALE,
  MAX_TICKETS,
  MIN_TICKET_SCALE,
  MIN_TICKETS,
  normalizePrizeTiers,
  TICKET_SCALE_STEP,
} from '@/lib/drawRules'
import type { DrawSession } from '@/hooks/useDrawSession'

const STEPS = [
  'Organization',
  'Tickets',
  'Insurance',
  'Prize tiers',
  'Display',
  'Review',
] as const

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: DrawSession
  controlsLocked?: boolean
  licensed?: boolean
}

type CheckResult = { id: string; label: string; ok: boolean; detail?: string }

export function EventSetupWizard({
  open,
  onOpenChange,
  session,
  controlsLocked = false,
  licensed = true,
}: Props) {
  const { config, applyConfig, commitTotalTickets, remaining, status, insuredCount } = session
  const [step, setStep] = useState(0)
  const [orgDraft, setOrgDraft] = useState(config.orgName)
  const [totalDraft, setTotalDraft] = useState(String(config.totalTickets))
  const [tiersDraft, setTiersDraft] = useState(config.prizeTiers.join(', '))
  const [paceDraft, setPaceDraft] = useState((config.paceMs / 1000).toFixed(1))
  const [checks, setChecks] = useState<CheckResult[] | null>(null)
  const [testing, setTesting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setStep(0)
    setOrgDraft(config.orgName)
    setTotalDraft(String(config.totalTickets))
    setTiersDraft((config.prizeTiers?.length ? config.prizeTiers : [config.stopAt]).join(', '))
    setPaceDraft((config.paceMs / 1000).toFixed(1))
    setChecks(null)
  }, [open, config.orgName, config.totalTickets, config.prizeTiers, config.stopAt, config.paceMs])

  const parsedTotal = useMemo(() => {
    const n = Number.parseInt(totalDraft, 10)
    return Number.isFinite(n) ? Math.min(MAX_TICKETS, Math.max(MIN_TICKETS, n)) : config.totalTickets
  }, [totalDraft, config.totalTickets])

  const parsedTiers = useMemo(() => {
    const nums = tiersDraft
      .split(/[,;\s]+/)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n))
    return normalizePrizeTiers(nums.length ? nums : [1], parsedTotal)
  }, [tiersDraft, parsedTotal])

  const applyOrg = () => {
    const orgName = orgDraft.trim() || 'Your Organization'
    applyConfig({ orgName })
    setOrgDraft(orgName)
  }

  const applyTickets = () => {
    commitTotalTickets(parsedTotal)
    setTotalDraft(String(parsedTotal))
  }

  const applyTiers = () => {
    const stopAt = parsedTiers[0] ?? 1
    applyConfig({ prizeTiers: parsedTiers, stopAt })
    setTiersDraft(parsedTiers.join(', '))
  }

  const applyDisplay = () => {
    const seconds = Number.parseFloat(paceDraft)
    const ms = Number.isFinite(seconds)
      ? Math.round(Math.min(60, Math.max(0.2, seconds)) * 1000)
      : config.paceMs
    applyConfig({ paceMs: ms })
    setPaceDraft((ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1))
  }

  const goNext = () => {
    if (controlsLocked) return
    if (step === 0) applyOrg()
    if (step === 1) applyTickets()
    if (step === 3) applyTiers()
    if (step === 4) applyDisplay()
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const goBack = () => setStep((s) => Math.max(0, s - 1))

  const onBrandFile = (file: File | null) => {
    if (!file?.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') applyConfig({ brandImageDataUrl: reader.result })
    }
    reader.readAsDataURL(file)
  }

  const runTests = async () => {
    setTesting(true)
    applyOrg()
    applyTickets()
    applyTiers()
    applyDisplay()

    const results: CheckResult[] = []
    const org = (orgDraft.trim() || config.orgName).trim()
    results.push({
      id: 'org',
      label: 'Organization name',
      ok: org.length > 0 && org !== 'Your Organization',
      detail: org === 'Your Organization' ? 'Set a real event / venue name' : org,
    })
    results.push({
      id: 'pool',
      label: 'Ticket pool',
      ok: parsedTotal > (parsedTiers[0] ?? 1),
      detail: `${parsedTotal} tickets · first stop at ${parsedTiers[0] ?? 1}`,
    })
    results.push({
      id: 'tiers',
      label: 'Prize tiers',
      ok: parsedTiers.every((t) => t >= 1 && t <= parsedTotal),
      detail: parsedTiers.join(' → '),
    })
    results.push({
      id: 'insurance',
      label: 'Insurance marks',
      ok: true,
      detail:
        insuredCount === 0
          ? 'None marked yet (OK — add as sold)'
          : `${insuredCount} insured (green)`,
    })
    results.push({
      id: 'display',
      label: 'Ticket size & pace',
      ok: true,
      detail: `${Math.round((config.ticketScale ?? 1) * 100)}% · ${(config.paceMs / 1000).toFixed(1)}s`,
    })
    results.push({
      id: 'license',
      label: 'Live license',
      ok: licensed || import.meta.env.DEV,
      detail: licensed
        ? 'Active'
        : import.meta.env.DEV
          ? 'Dev mode (gate skipped)'
          : 'Enter an activation code before Start',
    })

    const api = window.drawDown
    if (api?.getStageDisplayStatus) {
      const stage = await api.getStageDisplayStatus()
      results.push({
        id: 'stage',
        label: 'Stage window',
        ok: stage.available,
        detail: stage.available
          ? `${stage.displayLabel || 'Display'} · ${stage.resolution || '?'} · FS ${stage.isFullScreen ? 'on' : 'off'}`
          : 'Stage window not open',
      })
      results.push({
        id: 'projector',
        label: 'Projector placement',
        ok: stage.available && (stage.onPrimary === false || stage.displays.length === 1),
        detail:
          stage.displays.length <= 1
            ? 'Single display — OK for laptop-only rehearsal'
            : stage.onPrimary
              ? 'Stage is on the primary monitor — use Move to Projector'
              : 'Stage on external display',
      })
    } else {
      results.push({
        id: 'stage',
        label: 'Stage window',
        ok: true,
        detail: 'Browser preview (desktop app has projector APIs)',
      })
    }

    results.push({
      id: 'idle',
      label: 'Board ready',
      ok: status === 'idle' || status === 'paused' || status === 'finished',
      detail: `Status ${status} · ${remaining} remaining`,
    })

    setChecks(results)
    setTesting(false)
  }

  const allOk = checks != null && checks.every((c) => c.ok)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,640px)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Event setup wizard</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length}: {STEPS[step]}. Walk through setup before you go live.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap gap-1.5" aria-label="Wizard steps">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                className={`px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${
                  i === step
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : i < step
                      ? 'border border-[var(--safe)]/40 text-[var(--safe)]'
                      : 'border border-[var(--line)] text-[var(--ink-faint)]'
                }`}
                onClick={() => setStep(i)}
                disabled={controlsLocked}
              >
                {i + 1}. {label}
              </button>
            </li>
          ))}
        </ol>

        <div className="min-h-[220px] space-y-4 pt-1">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wiz-org">Organization / event name</Label>
                <Input
                  id="wiz-org"
                  value={orgDraft}
                  disabled={controlsLocked}
                  onChange={(e) => setOrgDraft(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Brand image (optional)</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onBrandFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={controlsLocked}
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus />
                    Upload image
                  </Button>
                  {config.brandImageDataUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={controlsLocked}
                      onClick={() => applyConfig({ brandImageDataUrl: null })}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <Label htmlFor="wiz-total">Starting ticket count</Label>
              <Input
                id="wiz-total"
                inputMode="numeric"
                value={totalDraft}
                disabled={controlsLocked || session.drawHasStarted}
                onChange={(e) => setTotalDraft(e.target.value)}
              />
              <p className="text-xs text-[var(--ink-faint)]">
                Max {MAX_TICKETS}. Changing count rebuilds the board (all yellow) before the draw
                starts.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="-mx-1 max-h-[50vh] overflow-y-auto px-1">
              <InsuranceManager session={session} locked={controlsLocked || status === 'running'} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <Label htmlFor="wiz-tiers">Prize stop tiers (remaining)</Label>
              <Input
                id="wiz-tiers"
                value={tiersDraft}
                disabled={controlsLocked}
                onChange={(e) => setTiersDraft(e.target.value)}
                placeholder="10, 5, 1"
              />
              <p className="text-xs text-[var(--ink-faint)]">
                Comma-separated stop levels, highest first. First value becomes the initial “stop
                when remaining.” After each prize, lower the stop and continue.
              </p>
              <p className="text-sm text-[var(--ink-muted)]">
                Planned path: {parsedTiers.join(' → ')} remaining
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between gap-2">
                  <Label>Ticket size</Label>
                  <span className="font-mono text-sm text-[var(--ink-muted)]">
                    {Math.round((config.ticketScale ?? 1) * 100)}%
                  </span>
                </div>
                <Slider
                  value={[config.ticketScale ?? 1]}
                  min={MIN_TICKET_SCALE}
                  max={MAX_TICKET_SCALE}
                  step={TICKET_SCALE_STEP}
                  disabled={controlsLocked}
                  onValueChange={(v) => applyConfig({ ticketScale: v[0] ?? 1 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wiz-pace">Draw pace (seconds)</Label>
                <Input
                  id="wiz-pace"
                  inputMode="decimal"
                  value={paceDraft}
                  disabled={controlsLocked}
                  onChange={(e) => setPaceDraft(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <ul className="space-y-1.5 text-sm text-[var(--ink-muted)]">
                <li>
                  <span className="text-[var(--ink-faint)]">Org:</span> {config.orgName}
                </li>
                <li>
                  <span className="text-[var(--ink-faint)]">Tickets:</span> {config.totalTickets} ·
                  stop {config.stopAt} · tiers {(config.prizeTiers ?? [config.stopAt]).join(' → ')}
                </li>
                <li>
                  <span className="text-[var(--ink-faint)]">Insured:</span> {insuredCount}
                </li>
                <li>
                  <span className="text-[var(--ink-faint)]">Display:</span>{' '}
                  {Math.round((config.ticketScale ?? 1) * 100)}% · {(config.paceMs / 1000).toFixed(1)}
                  s pace
                </li>
              </ul>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={testing || controlsLocked}
                onClick={() => void runTests()}
              >
                <FlaskConical />
                {testing ? 'Testing…' : 'Test Everything'}
              </Button>

              {checks && (
                <ul className="space-y-2" aria-label="Setup test results">
                  {checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 text-sm">
                      {c.ok ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--safe)]" />
                      ) : (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
                      )}
                      <div>
                        <p className={c.ok ? 'text-[var(--ink)]' : 'text-[var(--danger)]'}>{c.label}</p>
                        {c.detail && (
                          <p className="text-xs text-[var(--ink-faint)]">{c.detail}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {allOk && (
                <p className="text-sm text-[var(--safe)]">
                  All checks passed — close the wizard and use Projector safety, then Start.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] pt-4">
          <Button type="button" variant="ghost" disabled={step === 0} onClick={goBack}>
            <ChevronLeft />
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext} disabled={controlsLocked}>
              Next
              <ChevronRight />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                applyOrg()
                applyTickets()
                applyTiers()
                applyDisplay()
                onOpenChange(false)
              }}
              disabled={controlsLocked}
            >
              Finish setup
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
