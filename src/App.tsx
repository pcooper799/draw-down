import { OperatorPanel } from '@/components/OperatorPanel'
import { StageDisplay } from '@/components/StageDisplay'
import { useDrawSession } from '@/hooks/useDrawSession'

export default function App() {
  const session = useDrawSession()

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--stage)] text-[var(--ink)] lg:flex-row">
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
      />
      <OperatorPanel session={session} />
    </div>
  )
}
