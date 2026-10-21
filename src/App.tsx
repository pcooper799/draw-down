import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppWindow, PanelRightOpen } from 'lucide-react'
import { ActivationScreen, LicenseBadge } from '@/components/ActivationScreen'
import { FinishCelebration, useFinishCelebration } from '@/components/FinishCelebration'
import { OperatorPanel } from '@/components/OperatorPanel'
import { StageDisplay } from '@/components/StageDisplay'
import { Button } from '@/components/ui/button'
import { useDrawSession, type DrawSession } from '@/hooks/useDrawSession'
import { hasLiveEventProgress } from '@/lib/drawRules'
import { clearLicenseRecord, getLicenseStatus, type LicenseStatus } from '@/lib/license'
import {
  focusStageWindowElectron,
  openOperatorWindowElectron,
  publishBridgeState,
  readCachedBridgeState,
  sendBridgeCommand,
  subscribeBridge,
  type BridgeViewState,
} from '@/lib/sessionBridge'
import { getWindowRole, urlForRole, type WindowRole } from '@/lib/windowRole'

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
    const id = window.setInterval(refresh, 15_000)
    return () => window.clearInterval(id)
  }, [refresh])

  const licensed = status.state === 'active' || import.meta.env.DEV
  return { status, refresh, licensed, isDev: import.meta.env.DEV }
}

function buildViewState(session: DrawSession, license: LicenseStatus): BridgeViewState {
  return {
    v: 1,
    at: Date.now(),
    config: session.config,
    pool: session.pool,
    heldOut: session.heldOut,
    eliminated: session.eliminated,
    history: session.history,
    lastDrawn: session.lastDrawn,
    status: session.status,
    flashKey: session.flashKey,
    remaining: session.remaining,
    insuredRemaining: session.insuredRemaining,
    digits: session.digits,
    insuranceMarks: [...session.insuranceMarks],
    license,
    saveNotice: session.saveNotice,
    lastSavedAt: session.lastSavedAt,
  }
}

function usePublishSession(session: DrawSession, license: LicenseStatus, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    publishBridgeState(buildViewState(session, license))
  }, [
    enabled,
    session.config,
    session.pool,
    session.heldOut,
    session.eliminated,
    session.history,
    session.lastDrawn,
    session.status,
    session.flashKey,
    session.remaining,
    session.insuredRemaining,
    session.digits,
    session.insuranceMarks,
    session.saveNotice,
    session.lastSavedAt,
    license,
  ])
}

function useCommandRunner(
  session: DrawSession,
  licenseRefresh: () => void,
  enabled: boolean,
) {
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    if (!enabled) return
    return subscribeBridge((msg) => {
      if (msg.kind !== 'cmd') return
      const s = sessionRef.current
      const cmd = msg.cmd
      switch (cmd.type) {
        case 'start':
          s.start()
          break
        case 'pause':
          s.pause()
          break
        case 'reset':
          s.resetSession()
          break
        case 'save':
          s.saveNow()
          break
        case 'toggleHold':
          s.toggleTicketHold(cmd.ticket)
          break
        case 'setTicketInsured':
          s.setTicketInsured(cmd.ticket, cmd.insured)
          break
        case 'clearAllInsurance':
          s.clearAllInsurance()
          break
        case 'continueWithNewStop': {
          if (s.continueWithNewStop(cmd.stopAt) && cmd.resume) s.start()
          break
        }
        case 'applyConfig':
          s.applyConfig(cmd.patch)
          break
        case 'commitTotalTickets':
          s.commitTotalTickets(cmd.total)
          break
        case 'clearActivation':
          clearLicenseRecord()
          s.discardAutosave()
          s.resetSession()
          licenseRefresh()
          break
        case 'requestState':
          publishBridgeState(buildViewState(s, getLicenseStatus()))
          break
        case 'focusStage':
          void focusStageWindowElectron()
          break
        case 'showOperator':
          void openOperatorWindowElectron()
          break
        default:
          break
      }
    })
  }, [enabled, licenseRefresh])
}

function detachOperatorFromCombined() {
  openOperatorWindowElectron()
  // This window becomes stage-only so the board isn't covered.
  window.location.href = urlForRole('stage')
}

function CombinedOrOperatorApp({ role }: { role: Extract<WindowRole, 'combined' | 'operator'> }) {
  const license = useLicenseGate()
  const session = useDrawSession()
  const [projectionMode, setProjectionMode] = useState(false)
  const [renewOpen, setRenewOpen] = useState(false)
  const { status, start, pause, remaining, config, saveNow, eliminated, history } = session
  const finish = useFinishCelebration(status)
  const operatorOnly = role === 'operator'

  const liveEvent = hasLiveEventProgress({
    status,
    eliminatedCount: eliminated.length,
    historyCount: history.length,
    heldOutCount: session.heldOut.length,
  })

  const hardBlocked = !license.licensed && !liveEvent

  usePublishSession(session, license.status, true)
  useCommandRunner(session, license.refresh, true)

  useEffect(() => {
    if (license.licensed) {
      setRenewOpen(false)
      return
    }
    if (status === 'running') {
      pause()
      saveNow()
    }
    if (liveEvent) setRenewOpen(true)
  }, [license.licensed, liveEvent, status, pause, saveNow])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isTypingTarget(event.target)) return

      if (event.key === 'Escape' && projectionMode && !operatorOnly) {
        event.preventDefault()
        setProjectionMode(false)
        return
      }

      if (!license.licensed) {
        if ((event.key === ' ' || event.code === 'Space') && !event.repeat && status === 'running') {
          event.preventDefault()
          pause()
        }
        return
      }

      if (
        (event.key === 'o' || event.key === 'O') &&
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        !event.repeat
      ) {
        event.preventDefault()
        if (operatorOnly) void focusStageWindowElectron()
        else void openOperatorWindowElectron()
        return
      }

      if (
        !operatorOnly &&
        (event.key === 'p' || event.key === 'P') &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.repeat
      ) {
        event.preventDefault()
        setProjectionMode((v) => !v)
        return
      }

      if ((event.key === 's' || event.key === 'S') && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault()
        saveNow()
        return
      }

      if (event.key === ' ' || event.code === 'Space') {
        if (event.repeat) return
        event.preventDefault()
        if (status === 'running') pause()
        else if (status === 'paused' || status === 'idle' || status === 'finished') {
          if (remaining > config.stopAt) start()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    projectionMode,
    operatorOnly,
    status,
    start,
    pause,
    remaining,
    config.stopAt,
    saveNow,
    license.licensed,
  ])

  if (hardBlocked) {
    return <ActivationScreen status={license.status} onActivated={license.refresh} />
  }

  const panel = (
    <OperatorPanel
      session={session}
      separateWindow={operatorOnly}
      onEnterProjection={
        operatorOnly
          ? () => {
              void focusStageWindowElectron()
            }
          : () => setProjectionMode(true)
      }
      onOpenOperatorWindow={operatorOnly ? undefined : detachOperatorFromCombined}
      onFocusStage={operatorOnly ? () => void focusStageWindowElectron() : undefined}
      licenseBadge={<LicenseBadge status={license.status} />}
      controlsLocked={!license.licensed}
      onClearActivation={() => {
        clearLicenseRecord()
        session.discardAutosave()
        session.resetSession()
        license.refresh()
      }}
    />
  )

  if (operatorOnly) {
    return (
      <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--panel)] text-[var(--ink)]">
        {license.isDev && license.status.state !== 'active' && (
          <div className="border-b border-[var(--accent)]/40 bg-black/70 px-3 py-1 text-[0.65rem] text-[var(--accent)]">
            Dev mode · license gate skipped · operator window
          </div>
        )}
        {!license.licensed && liveEvent && (
          <div className="flex items-center justify-center gap-3 border-b border-[var(--danger)]/50 bg-[rgba(80,20,16,0.92)] px-3 py-2 text-sm">
            <span>License expired — draw paused.</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => setRenewOpen(true)}>
              Enter code
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1">{panel}</div>
        <FinishCelebration
          open={finish.open}
          onOpenChange={finish.setOpen}
          orgName={session.config.orgName}
          brandImageDataUrl={session.config.brandImageDataUrl}
          pool={session.pool}
          lastDrawn={session.lastDrawn}
          digits={session.digits}
          stopAt={session.config.stopAt}
          onContinueWithStop={session.continueWithNewStop}
          onResumeDraw={() => session.start()}
        />
        {renewOpen && !license.licensed && (
          <ActivationScreen
            status={license.status}
            onActivated={() => {
              license.refresh()
              setRenewOpen(false)
            }}
            variant="overlay"
            onDismiss={liveEvent ? () => setRenewOpen(false) : undefined}
          />
        )}
      </div>
    )
  }

  return (
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--stage)] text-[var(--ink)] lg:flex-row">
      {license.isDev && license.status.state !== 'active' && (
        <div className="absolute left-3 top-3 z-30 border border-[var(--accent)]/40 bg-black/70 px-2 py-1 text-[0.65rem] text-[var(--accent)]">
          Dev mode · license gate skipped
        </div>
      )}

      {!license.licensed && liveEvent && (
        <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-center gap-3 border-b border-[var(--danger)]/50 bg-[rgba(80,20,16,0.92)] px-3 py-2 text-sm text-[var(--ink)]">
          <span>License expired — draw paused. Enter a new code to continue.</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => setRenewOpen(true)}>
            Enter code
          </Button>
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
        heldOut={session.heldOut}
        onToggleHold={license.licensed ? session.toggleTicketHold : undefined}
      />

      {!projectionMode && panel}

      {projectionMode && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-end gap-2 px-3 pb-3 sm:px-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-events-auto h-8 border border-[var(--line)] bg-black/35 text-[var(--ink-muted)] opacity-40 hover:opacity-100"
            onClick={detachOperatorFromCombined}
            title="Open operator in a separate window"
          >
            <AppWindow className="size-3.5" />
            Operator window
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-events-auto h-8 border border-[var(--line)] bg-black/35 text-[var(--ink-muted)] opacity-40 hover:opacity-100"
            onClick={() => setProjectionMode(false)}
            aria-label="Show operator controls"
            title="Dock controls here (Esc or P)"
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
        stopAt={session.config.stopAt}
        onContinueWithStop={session.continueWithNewStop}
        onResumeDraw={() => session.start()}
      />

      {renewOpen && !license.licensed && (
        <ActivationScreen
          status={license.status}
          onActivated={() => {
            license.refresh()
            setRenewOpen(false)
          }}
          variant="overlay"
          onDismiss={liveEvent ? () => setRenewOpen(false) : undefined}
        />
      )}
    </div>
  )
}

function StageMirrorApp() {
  const [view, setView] = useState<BridgeViewState | null>(() => readCachedBridgeState())
  const finish = useFinishCelebration(view?.status ?? 'idle')

  useEffect(() => {
    sendBridgeCommand({ type: 'requestState' })
    return subscribeBridge((msg) => {
      if (msg.kind === 'state') setView(msg.state)
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return

      if (
        (event.key === 'o' || event.key === 'O') &&
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        !event.repeat
      ) {
        event.preventDefault()
        void openOperatorWindowElectron()
        return
      }

      if ((event.key === 's' || event.key === 'S') && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault()
        sendBridgeCommand({ type: 'save' })
        return
      }

      if (event.key === ' ' || event.code === 'Space') {
        if (event.repeat) return
        event.preventDefault()
        if (!view) return
        if (view.status === 'running') sendBridgeCommand({ type: 'pause' })
        else if (view.remaining > view.config.stopAt) sendBridgeCommand({ type: 'start' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view])

  const licensed =
    view?.license.state === 'active' || import.meta.env.DEV || view?.license == null
  const liveEvent = view
    ? hasLiveEventProgress({
        status: view.status,
        eliminatedCount: view.eliminated.length,
        historyCount: view.history.length,
        heldOutCount: view.heldOut.length,
      })
    : false

  if (!view) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--stage)] text-[var(--ink)]">
        <p className="font-display text-3xl tracking-wide">Waiting for operator window…</p>
        <p className="text-sm text-[var(--ink-muted)]">
          Open controls so the stage can follow the live draw.
        </p>
        <Button type="button" onClick={() => void openOperatorWindowElectron()}>
          <AppWindow />
          Open operator window
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            window.location.href = urlForRole('combined')
          }}
        >
          Use single window instead
        </Button>
      </div>
    )
  }

  if (view.license.state !== 'active' && !import.meta.env.DEV && !liveEvent) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[var(--stage)] text-[var(--ink)]">
        <p className="font-display text-3xl">Activation required</p>
        <p className="text-sm text-[var(--ink-muted)]">Enter the code in the operator window.</p>
        <Button type="button" onClick={() => void openOperatorWindowElectron()}>
          Show operator window
        </Button>
      </div>
    )
  }

  return (
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--stage)] text-[var(--ink)]">
      <StageDisplay
        orgName={view.config.orgName}
        brandImageDataUrl={view.config.brandImageDataUrl}
        remaining={view.remaining}
        stopAt={view.config.stopAt}
        totalTickets={view.config.totalTickets}
        lastDrawn={view.lastDrawn}
        flashKey={view.flashKey}
        status={view.status}
        digits={view.digits}
        insuredRemaining={view.insuredRemaining}
        pool={view.pool}
        heldOut={view.heldOut}
        onToggleHold={
          licensed
            ? (ticket) => sendBridgeCommand({ type: 'toggleHold', ticket })
            : undefined
        }
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-end px-3 pb-3 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="pointer-events-auto h-8 border border-[var(--line)] bg-black/35 text-[var(--ink-muted)] opacity-50 hover:opacity-100"
          onClick={() => void openOperatorWindowElectron()}
          title="Show operator window (Ctrl/Cmd+Shift+O)"
        >
          <AppWindow className="size-3.5" />
          Operator
        </Button>
      </div>

      <FinishCelebration
        open={finish.open}
        onOpenChange={finish.setOpen}
        orgName={view.config.orgName}
        brandImageDataUrl={view.config.brandImageDataUrl}
        pool={view.pool}
        lastDrawn={view.lastDrawn}
        digits={view.digits}
        stopAt={view.config.stopAt}
        onContinueWithStop={(stopAt) => {
          const ok = view.remaining > stopAt
          if (ok) sendBridgeCommand({ type: 'continueWithNewStop', stopAt, resume: true })
          return ok
        }}
        onResumeDraw={() => {
          /* resume already requested with continueWithNewStop */
        }}
      />
    </div>
  )
}

export default function App() {
  const role = useMemo(() => getWindowRole(), [])

  if (role === 'stage') return <StageMirrorApp />
  return <CombinedOrOperatorApp role={role} />
}
