import { useCallback, useEffect, useState } from 'react'
import { PanelRightOpen } from 'lucide-react'
import { ActivationScreen, LicenseBadge } from '@/components/ActivationScreen'
import { FinishCelebration, useFinishCelebration } from '@/components/FinishCelebration'
import { OperatorPanel } from '@/components/OperatorPanel'
import { StageDisplay } from '@/components/StageDisplay'
import { Button } from '@/components/ui/button'
import { useDrawSession } from '@/hooks/useDrawSession'
import { getLicenseStatus, type LicenseStatus } from '@/lib/license'

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    target.isContentEditable ||
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT'
  )
}

function useLicenseGate() {
  const [status, setStatus] = useState<LicenseStatus>(() => getLicenseStatus())
  const refresh = useCallback(() => setStatus(getLicenseStatus()), [])

  useEffect(() => {
    const id = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(id)
  }, [refresh])

  const licensed = status.state === 'active' || import.meta.env.DEV
  return { status, refresh, licensed, isDev: import.meta.env.DEV }
}

export default function App() {
  const license = useLicenseGate()
  const session = useDrawSession()
  const [projectionMode, setProjectionMode] = useState(false)
  const { status, start, pause, remaining, config, saveNow } = session
  const finish = useFinishCelebration(status)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isTypingTarget(event.target)) return
      if (!license.licensed) return

      if (event.key === 'Escape' && projectionMode) {
        event.preventDefault()
        setProjectionMode(false)
        return
      }

      if (
        (event.key === 'p' || event.key === 'P') &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault()
        setProjectionMode((v) => !v)
        return
      }

      if ((event.key === 's' || event.key === 'S') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        saveNow()
        return
      }

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault()
        if (status === 'running') {
          pause()
        } else if (status === 'paused' || status === 'idle') {
          if (remaining > config.stopAt) {
            start()
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [projectionMode, status, start, pause, remaining, config.stopAt, saveNow, license.licensed])

  if (!license.licensed) {
    return <ActivationScreen status={license.status} onActivated={license.refresh} />
  }

  return (
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--stage)] text-[var(--ink)] lg:flex-row">
      {license.isDev && license.status.state !== 'active' && (
        <div className="absolute left-3 top-3 z-30 border border-[var(--accent)]/40 bg-black/70 px-2 py-1 text-[0.65rem] text-[var(--accent)]">
          Dev mode · license gate skipped
        </div>
      )}

      <StageDisplay
        orgName={session.config.orgName}
        brandImageDataUrl={session.config.brandImageDataUrl}
        remaining={session.remaining}
        stopAt={session.config.stopAt}
        totalTickets={session.config.totalTickets}
        lastDrawn={session.lastDrawn}
        flashKey={session.flashKey}
        status={session.status}
        digits={session.digits}
        insuredRemaining={session.insuredRemaining}
        pool={session.pool}
      />

      {!projectionMode && (
        <OperatorPanel
          session={session}
          onEnterProjection={() => setProjectionMode(true)}
          licenseBadge={<LicenseBadge status={license.status} />}
        />
      )}

      {projectionMode && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-end px-3 pb-3 sm:px-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-events-auto h-8 border border-[var(--line)] bg-black/35 text-[var(--ink-muted)] opacity-40 hover:opacity-100"
            onClick={() => setProjectionMode(false)}
            aria-label="Show operator controls"
            title="Show operator controls (Esc or P). Space pauses or resumes."
          >
            <PanelRightOpen className="size-3.5" />
            Controls
          </Button>
        </div>
      )}

      <FinishCelebration
        open={finish.open}
        onOpenChange={finish.setOpen}
        orgName={session.config.orgName}
        brandImageDataUrl={session.config.brandImageDataUrl}
        pool={session.pool}
        lastDrawn={session.lastDrawn}
        digits={session.digits}
      />
    </div>
  )
}
