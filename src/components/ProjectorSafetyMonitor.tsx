import { useCallback, useEffect, useState } from 'react'
import { Monitor, Maximize2, Minimize2, MoveRight } from 'lucide-react'
import { StagePreview } from '@/components/StagePreview'
import { Button } from '@/components/ui/button'
import type { DrawSession } from '@/hooks/useDrawSession'

type Props = {
  session: DrawSession
}

export function ProjectorSafetyMonitor({ session }: Props) {
  const [status, setStatus] = useState<DrawDownStageDisplayStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const hasApi = Boolean(window.drawDown?.getStageDisplayStatus)

  const refresh = useCallback(async () => {
    const api = window.drawDown
    if (!api?.getStageDisplayStatus) {
      setStatus(null)
      return
    }
    try {
      setStatus(await api.getStageDisplayStatus())
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 2000)
    return () => window.clearInterval(id)
  }, [refresh])

  const statusLabel =
    session.status === 'running'
      ? 'DRAWING'
      : session.status === 'paused'
        ? 'PAUSED'
        : session.status === 'finished'
          ? 'COMPLETE'
          : 'READY'

  const onProjector = async () => {
    const api = window.drawDown
    if (!api?.moveStageToProjector) {
      setMessage('Projector move needs the desktop app (Electron).')
      return
    }
    setBusy(true)
    setMessage(null)
    const result = await api.moveStageToProjector()
    setBusy(false)
    if (!result.ok) {
      setMessage(result.reason || 'Could not move stage window')
      return
    }
    if (result.status) setStatus(result.status)
    else void refresh()
    setMessage('Stage moved to projector and fullscreen requested.')
  }

  const toggleFullscreen = async () => {
    const api = window.drawDown
    if (!api?.setStageFullscreen || !status) return
    setBusy(true)
    const result = await api.setStageFullscreen(!status.isFullScreen)
    setBusy(false)
    if (result.status) setStatus(result.status)
    else void refresh()
  }

  const monitorOk =
    status?.available &&
    status.isFullScreen &&
    status.onPrimary === false &&
    status.displays.length > 1

  return (
    <section className="operator-section space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg tracking-wide text-[var(--ink)]">Projector safety</h3>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Confirm the stage is on the right screen before you go live.
          </p>
        </div>
        <Monitor className="size-5 shrink-0 text-[var(--ink-faint)]" aria-hidden />
      </div>

      {!hasApi && (
        <p className="text-xs text-[var(--warn)]">
          Browser mode — display move/fullscreen APIs are available in the Windows desktop app.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat
          label="Stage monitor"
          value={
            !status?.available
              ? 'Not open'
              : status.onPrimary
                ? `${status.displayLabel || 'Primary'} (primary)`
                : status.displayLabel || 'External'
          }
          ok={status?.available ? status.onPrimary === false || status.displays.length === 1 : false}
        />
        <Stat label="Resolution" value={status?.resolution || '—'} ok={Boolean(status?.resolution)} />
        <Stat
          label="Fullscreen"
          value={status?.isFullScreen ? 'On' : status?.available ? 'Off' : '—'}
          ok={Boolean(status?.isFullScreen)}
        />
        <Stat
          label="Safety"
          value={monitorOk ? 'Ready' : status?.available ? 'Check display' : 'Waiting'}
          ok={Boolean(monitorOk)}
        />
      </div>

      <StagePreview
        totalTickets={session.config.totalTickets}
        pool={session.pool}
        heldOut={session.heldOut}
        digits={session.digits}
        orgName={session.config.orgName}
        statusLabel={statusLabel}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="flex-1"
          disabled={busy || !hasApi}
          onClick={() => void onProjector()}
        >
          <MoveRight className="size-4" />
          Move to Projector
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !hasApi || !status?.available}
          onClick={() => void toggleFullscreen()}
          title={status?.isFullScreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {status?.isFullScreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          {status?.isFullScreen ? 'Exit FS' : 'Fullscreen'}
        </Button>
      </div>

      {status && status.displays.length > 0 && (
        <ul className="space-y-1 text-[0.7rem] text-[var(--ink-faint)]">
          {status.displays.map((d) => (
            <li key={d.id}>
              {d.label}
              {d.primary ? ' · primary' : ''}
              {status.displayId === d.id ? ' · stage here' : ''}
              {status.suggestedProjectorId === d.id ? ' · suggested projector' : ''}
              {' · '}
              {d.bounds.width}×{d.bounds.height}
            </li>
          ))}
        </ul>
      )}

      {message && <p className="text-xs text-[var(--ink-muted)]">{message}</p>}
    </section>
  )
}

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="border border-[var(--line)] bg-black/25 px-2 py-1.5">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
        {label}
      </p>
      <p className={`mt-0.5 font-medium ${ok ? 'text-[var(--safe)]' : 'text-[var(--warn)]'}`}>{value}</p>
    </div>
  )
}
