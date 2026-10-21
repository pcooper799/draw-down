import { useEffect, useState } from 'react'
import { PanelRightOpen } from 'lucide-react'
import { OperatorPanel } from '@/components/OperatorPanel'
import { StageDisplay } from '@/components/StageDisplay'
import { Button } from '@/components/ui/button'
import { useDrawSession } from '@/hooks/useDrawSession'

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

export default function App() {
  const session = useDrawSession()
  const [projectionMode, setProjectionMode] = useState(false)
  const { status, start, pause, remaining, config } = session

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isTypingTarget(event.target)) return

      // Exit projection / show controls
      if (event.key === 'Escape' && projectionMode) {
        event.preventDefault()
        setProjectionMode(false)
        return
      }

      // Toggle projection (P). Ignore when modifier chords are held except Shift.
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

      // Space: pause / resume while projecting (also handy with controls visible)
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
  }, [projectionMode, status, start, pause, remaining, config.stopAt])

  return (
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--stage)] text-[var(--ink)] lg:flex-row">
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
    </div>
  )
}
