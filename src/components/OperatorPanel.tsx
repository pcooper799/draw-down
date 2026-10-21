import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  FolderOpen,
  ImagePlus,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  Save,
  Settings2,
  Download,
  Trash2,
} from 'lucide-react'
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
import { MAX_TICKETS } from '@/lib/drawRules'
import { formatSavedAt } from '@/lib/sessionPersist'
import { formatTicket } from '@/lib/utils'
import type { DrawSession } from '@/hooks/useDrawSession'

type Props = {
  session: DrawSession
  onEnterProjection: () => void
  licenseBadge?: ReactNode
  /** When true, block start/reset/setup that would continue an unlicensed event. */
  controlsLocked?: boolean
}

export function OperatorPanel({
  session,
  onEnterProjection,
  licenseBadge,
  controlsLocked = false,
}: Props) {
  const {
    config,
    applyConfig,
    commitTotalTickets,
    status,
    start,
    pause,
    resetSession,
    continueWithNewStop,
    history,
    digits,
    remaining,
    saveNow,
    exportSaveFile,
    loadSaveFile,
    lastSavedAt,
    saveNotice,
  } = session

  const locked = status === 'running' || controlsLocked
  const drawLocked = status === 'running'
  const canResumePastStop = remaining > config.stopAt
  const fileRef = useRef<HTMLInputElement>(null)
  const loadRef = useRef<HTMLInputElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [totalDraft, setTotalDraft] = useState(String(config.totalTickets))
  const [stopDraft, setStopDraft] = useState(String(config.stopAt))
  const [orgDraft, setOrgDraft] = useState(config.orgName)
  const [paceDraft, setPaceDraft] = useState((config.paceMs / 1000).toFixed(1))
  const [prizeStopDraft, setPrizeStopDraft] = useState('1')
  const [uninstallBusy, setUninstallBusy] = useState(false)
  const [uninstallMessage, setUninstallMessage] = useState<string | null>(null)
  const [canUninstall, setCanUninstall] = useState(false)

  useEffect(() => {
    let cancelled = false
    const api = window.drawDown
    if (!api?.getInstallInfo) {
      setCanUninstall(false)
      return
    }
    void api.getInstallInfo().then((info) => {
      if (!cancelled) setCanUninstall(Boolean(info.canUninstall))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (status !== 'finished') return
    const maxNext = Math.max(1, remaining - 1)
    setPrizeStopDraft(String(Math.min(1, maxNext)))
  }, [status, remaining])

  const paceSeconds = config.paceMs / 1000

  useEffect(() => {
    if (!settingsOpen) {
      setTotalDraft(String(config.totalTickets))
      setStopDraft(String(config.stopAt))
      setOrgDraft(config.orgName)
    }
  }, [config.totalTickets, config.stopAt, config.orgName, settingsOpen])

  useEffect(() => {
    setPaceDraft((config.paceMs / 1000).toFixed(config.paceMs % 1000 === 0 ? 0 : 1))
  }, [config.paceMs])

  const commitSettingsDrafts = () => {
    if (controlsLocked) return
    const orgName = orgDraft.trim() || 'Your Organization'
    const stopParsed = Number.parseInt(stopDraft, 10)
    const stopAt = Number.isFinite(stopParsed) ? Math.max(1, stopParsed) : 1
    const totalParsed = Number.parseInt(totalDraft, 10)
    const total =
      Number.isFinite(totalParsed) && totalParsed >= 1
        ? Math.min(MAX_TICKETS, totalParsed)
        : config.totalTickets

    applyConfig({ orgName, stopAt })
    setStopDraft(String(stopAt))
    setOrgDraft(orgName)

    if (total !== config.totalTickets) {
      commitTotalTickets(total)
      setTotalDraft(String(Math.min(MAX_TICKETS, Math.max(total, stopAt))))
    } else {
      setTotalDraft(String(config.totalTickets))
    }
  }

  const commitPaceSeconds = (raw: string) => {
    const seconds = Number.parseFloat(raw)
    if (!Number.isFinite(seconds)) {
      setPaceDraft((config.paceMs / 1000).toFixed(1))
      return
    }
    const ms = Math.round(Math.min(60, Math.max(0.2, seconds)) * 1000)
    applyConfig({ paceMs: ms })
    setPaceDraft((ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1))
  }

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
    <aside className="operator-panel flex w-full shrink-0 flex-col border-t border-[var(--line)] lg:w-[400px] lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3.5">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--ink-faint)]">
            Operator
          </p>
          <p className="font-display text-xl tracking-wide text-[var(--ink)]">Controls</p>
          {licenseBadge}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            className="gap-2"
            onClick={onEnterProjection}
            title="Hide controls for projection (P)"
            aria-label="Enter projection mode"
          >
            <MonitorPlay />
            Project
          </Button>
          <Dialog
            open={settingsOpen}
            onOpenChange={(open) => {
              if (controlsLocked) return
              if (!open && settingsOpen) commitSettingsDrafts()
              setSettingsOpen(open)
            }}
          >
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                aria-label="Session settings"
                disabled={controlsLocked}
              >
                <Settings2 />
                Setup
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Session setup</DialogTitle>
                <DialogDescription>
                  Configure the pool before you go live. Changing ticket count resets the draw.
                  After a stop, lower “Stop when remaining” to continue for the next prize.
                  Values save when you close this dialog. Max {MAX_TICKETS} tickets.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization name</Label>
                  <Input
                    id="org-name"
                    value={orgDraft}
                    onChange={(e) => setOrgDraft(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="total">Starting tickets</Label>
                    <Input
                      id="total"
                      inputMode="numeric"
                      value={totalDraft}
                      disabled={drawLocked}
                      onChange={(e) => setTotalDraft(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stop">Stop when remaining</Label>
                    <Input
                      id="stop"
                      inputMode="numeric"
                      value={stopDraft}
                      disabled={drawLocked}
                      onChange={(e) => setStopDraft(e.target.value)}
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
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    commitSettingsDrafts()
                    setSettingsOpen(false)
                  }}
                >
                  Save & close
                </Button>
                <div className="space-y-2 border-t border-[var(--line)] pt-4">
                  <p className="text-xs text-[var(--ink-faint)]">
                    Remove this app from the PC. Uses the Windows uninstaller from the NSIS install.
                  </p>
                  <Button
                    type="button"
                    variant="danger"
                    className="w-full"
                    disabled={uninstallBusy}
                    onClick={() => {
                      void (async () => {
                        setUninstallBusy(true)
                        setUninstallMessage(null)
                        const api = window.drawDown
                        if (!api?.uninstall) {
                          setUninstallMessage(
                            'Uninstall runs from the installed Windows app (not portable/browser).',
                          )
                          setUninstallBusy(false)
                          return
                        }
                        const result = await api.uninstall()
                        if (!result.ok) {
                          setUninstallMessage(
                            result.reason ??
                              'Could not open the uninstaller. Use Windows Settings → Apps if needed.',
                          )
                          setUninstallBusy(false)
                        }
                      })()
                    }}
                  >
                    <Trash2 />
                    {canUninstall ? 'Uninstall Draw Down…' : 'Uninstall (Windows install)'}
                  </Button>
                  {uninstallMessage && (
                    <p className="text-xs text-[var(--danger)]">{uninstallMessage}</p>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {(saveNotice || lastSavedAt) && (
          <div className="operator-note flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <span className="text-[var(--accent)]">{saveNotice ?? 'Autosave on'}</span>
            {lastSavedAt && (
              <span className="text-[var(--ink-faint)]">{formatSavedAt(lastSavedAt)}</span>
            )}
          </div>
        )}

        <section className="operator-section space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Session save</Label>
            <span className="text-[0.65rem] text-[var(--ink-faint)]">Ctrl/Cmd+S</span>
          </div>
          <p className="text-xs text-[var(--ink-muted)]">
            Autosaves locally as you go. Export a file to pick up on another PC.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => saveNow()}>
              <Save />
              Save
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={exportSaveFile}>
              <Download />
              Export
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => loadRef.current?.click()}>
              <FolderOpen />
              Load
            </Button>
          </div>
          <input
            ref={loadRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void loadSaveFile(file)
              e.target.value = ''
            }}
          />
        </section>

        <section className="operator-section space-y-3">
          <div className="flex items-end justify-between gap-3">
            <Label htmlFor="pace-seconds">Draw pace</Label>
            <div className="flex items-center gap-2">
              <Input
                id="pace-seconds"
                className="h-8 w-20 text-right font-mono"
                inputMode="decimal"
                value={paceDraft}
                disabled={controlsLocked}
                onChange={(e) => setPaceDraft(e.target.value)}
                onBlur={() => commitPaceSeconds(paceDraft)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                aria-label="Draw pace in seconds"
              />
              <span className="text-sm text-[var(--ink-muted)]">s</span>
            </div>
          </div>
          <Slider
            value={[config.paceMs]}
            min={500}
            max={10000}
            step={100}
            disabled={controlsLocked}
            onValueChange={(v) => applyConfig({ paceMs: v[0] ?? 2500 })}
          />
          <p className="text-xs text-[var(--ink-faint)]">
            {paceSeconds.toFixed(paceSeconds < 10 ? 1 : 0)}s between draws · editable live
          </p>
        </section>

        <section className="operator-section space-y-3">
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
                disabled={controlsLocked || !canResumePastStop}
              >
                <Play />
                {status === 'paused' || (status === 'finished' && canResumePastStop)
                  ? 'Resume'
                  : 'Start'}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={resetSession}
              disabled={drawLocked || controlsLocked}
              aria-label="Reset draw"
            >
              <RotateCcw />
            </Button>
          </div>
          {controlsLocked && (
            <p className="border border-[var(--danger)]/40 bg-[rgba(211,90,74,0.1)] px-3 py-2 text-sm text-[var(--danger)]">
              License expired — enter a new code to resume the draw.
            </p>
          )}
          {status === 'finished' && (
            <div className="space-y-3 border border-[var(--accent)]/40 bg-[rgba(232,168,56,0.1)] px-3 py-3">
              <p className="text-sm text-[var(--accent)]">
                Stopped at {config.stopAt} remaining — {remaining} ticket
                {remaining === 1 ? '' : 's'} still in.
              </p>
              {remaining > 1 ? (
                <div className="space-y-2">
                  <Label htmlFor="prize-stop">Next prize stop</Label>
                  <div className="flex gap-2">
                    <Input
                      id="prize-stop"
                      inputMode="numeric"
                      value={prizeStopDraft}
                      disabled={controlsLocked}
                      onChange={(e) => setPrizeStopDraft(e.target.value)}
                    />
                    <Button
                      type="button"
                      disabled={controlsLocked}
                      onClick={() => {
                        const parsed = Number.parseInt(prizeStopDraft, 10)
                        if (!Number.isFinite(parsed)) return
                        if (continueWithNewStop(parsed)) {
                          start()
                        }
                      }}
                    >
                      Continue
                    </Button>
                  </div>
                  <p className="text-xs text-[var(--ink-faint)]">
                    Set a lower stop (1–{Math.max(1, remaining - 1)}) for the next prize, then keep
                    drawing.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[var(--ink-faint)]">Final stop — reset to start a new event.</p>
              )}
            </div>
          )}
        </section>

        <section className="operator-section space-y-2">
          <p className="text-xs text-[var(--ink-faint)]">
            Right-click a ticket on the board to hold it out (auction), then right-click again to
            bring it back in. Drawn-out tickets stay out.
            {session.heldOut.length > 0
              ? ` · ${session.heldOut.length} held now.`
              : ''}
          </p>
          <InsuranceManager session={session} locked={drawLocked || controlsLocked} />
        </section>

        <section className="operator-section space-y-2">
          <Label>Recent draws</Label>
          <div className="max-h-44 overflow-y-auto border border-[var(--line)] bg-[var(--panel-elevated)]/80">
            {history.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--ink-faint)]">No draws yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {history.slice(0, 12).map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <span className="font-mono text-[var(--ink)]">
                      #{formatTicket(event.ticket, digits)}
                    </span>
                    <span
                      className={
                        event.outcome === 'returned' ? 'text-[var(--safe)]' : 'text-[var(--danger)]'
                      }
                    >
                      {event.outcome === 'returned' ? 'Returned · used' : 'Out'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </aside>
  )
}
