import { useRef, useState } from 'react'
import { ImagePlus, Pause, Play, RotateCcw, Settings2 } from 'lucide-react'
import { InsuranceManager } from '@/components/InsuranceManager'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { formatTicket } from '@/lib/utils'
import type { DrawSession } from '@/hooks/useDrawSession'

type Props = {
  session: DrawSession
}

export function OperatorPanel({ session }: Props) {
  const {
    config,
    applyConfig,
    commitTotalTickets,
    status,
    start,
    pause,
    resetSession,
    history,
    digits,
    remaining,
  } = session

  const locked = status === 'running'
  const fileRef = useRef<HTMLInputElement>(null)
  const [totalDraft, setTotalDraft] = useState(String(config.totalTickets))
  const [stopDraft, setStopDraft] = useState(String(config.stopAt))
  const [orgDraft, setOrgDraft] = useState(config.orgName)

  const paceSeconds = config.paceMs / 1000

  const onBrandFile = (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        applyConfig({ brandImageDataUrl: reader.result })
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-t border-[var(--line)] bg-[var(--panel)] lg:w-[380px] lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            Operator
          </p>
          <p className="font-display text-lg tracking-wide text-[var(--ink)]">Controls</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Session settings">
              <Settings2 />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Session setup</DialogTitle>
              <DialogDescription>
                Configure the pool before you go live. Changing ticket count resets the draw.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  value={orgDraft}
                  onChange={(e) => setOrgDraft(e.target.value)}
                  onBlur={() => applyConfig({ orgName: orgDraft.trim() || 'Your Organization' })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="total">Starting tickets</Label>
                  <Input
                    id="total"
                    inputMode="numeric"
                    value={totalDraft}
                    disabled={locked}
                    onChange={(e) => setTotalDraft(e.target.value)}
                    onBlur={() => {
                      const n = Number.parseInt(totalDraft, 10)
                      if (Number.isFinite(n) && n >= 1) {
                        commitTotalTickets(n)
                        setTotalDraft(String(Math.max(n, config.stopAt)))
                      } else {
                        setTotalDraft(String(config.totalTickets))
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stop">Stop when remaining</Label>
                  <Input
                    id="stop"
                    inputMode="numeric"
                    value={stopDraft}
                    disabled={locked}
                    onChange={(e) => setStopDraft(e.target.value)}
                    onBlur={() => {
                      const n = Number.parseInt(stopDraft, 10)
                      const stopAt = Number.isFinite(n) ? Math.max(1, n) : 1
                      applyConfig({ stopAt })
                      setStopDraft(String(stopAt))
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Organization image</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onBrandFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>
                    <ImagePlus />
                    Upload image
                  </Button>
                  {config.brandImageDataUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => applyConfig({ brandImageDataUrl: null })}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <Label>Draw pace</Label>
            <span className="font-mono text-sm text-[var(--accent)]">
              {paceSeconds.toFixed(paceSeconds < 10 ? 1 : 0)}s
            </span>
          </div>
          <Slider
            value={[config.paceMs]}
            min={500}
            max={10000}
            step={100}
            onValueChange={(v) => applyConfig({ paceMs: v[0] ?? 2500 })}
          />
          <p className="text-xs text-[var(--ink-faint)]">
            Time between draws. Editable live while drawing.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {status === 'running' ? (
            <Button type="button" variant="secondary" className="col-span-2" size="lg" onClick={pause}>
              <Pause />
              Pause
            </Button>
          ) : (
            <Button
              type="button"
              className="col-span-2"
              size="lg"
              onClick={start}
              disabled={status === 'finished' || remaining <= config.stopAt}
            >
              <Play />
              {status === 'paused' ? 'Resume' : 'Start'}
            </Button>
          )}
          <Button type="button" variant="outline" size="lg" onClick={resetSession} disabled={locked}>
            <RotateCcw />
          </Button>
        </div>

        {status === 'finished' && (
          <p className="border border-[var(--accent)]/40 bg-[rgba(232,168,56,0.08)] px-3 py-2 text-sm text-[var(--accent)]">
            Draw complete — {remaining} ticket{remaining === 1 ? '' : 's'} remain.
          </p>
        )}

        <InsuranceManager session={session} locked={locked} />

        <div className="space-y-2">
          <Label>Recent draws</Label>
          <div className="max-h-44 overflow-y-auto border border-[var(--line)] bg-[var(--panel-elevated)]">
            {history.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--ink-faint)]">No draws yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {history.slice(0, 12).map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-[var(--ink)]">
                      #{formatTicket(event.ticket, digits)}
                    </span>
                    <span
                      className={
                        event.outcome === 'returned' ? 'text-[var(--safe)]' : 'text-[var(--danger)]'
                      }
                    >
                      {event.outcome === 'returned' ? 'Returned' : 'Out'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
