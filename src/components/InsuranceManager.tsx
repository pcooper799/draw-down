import { useMemo, useState } from 'react'
import { Shield, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatTicket } from '@/lib/utils'
import type { DrawSession } from '@/hooks/useDrawSession'

type Props = {
  session: DrawSession
  locked: boolean
}

export function InsuranceManager({ session, locked }: Props) {
  const {
    config,
    insuranceMarks,
    insuredCount,
    eliminated,
    heldOut,
    setTicketInsured,
    clearAllInsurance,
    digits,
  } = session

  const [ticketInput, setTicketInput] = useState('')

  const eliminatedSet = useMemo(() => new Set(eliminated), [eliminated])
  const heldSet = useMemo(() => new Set(heldOut), [heldOut])

  const insuredList = useMemo(
    () =>
      [...insuranceMarks]
        .filter((n) => !eliminatedSet.has(n))
        .sort((a, b) => a - b),
    [insuranceMarks, eliminatedSet],
  )

  const ticketNum = Number.parseInt(ticketInput, 10)
  const inRange =
    Number.isFinite(ticketNum) && ticketNum >= 1 && ticketNum <= config.totalTickets
  const alreadyOut = inRange && eliminatedSet.has(ticketNum)
  const isHeld = inRange && heldSet.has(ticketNum)
  const ticketValid = inRange && !alreadyOut && !isHeld
  const alreadyInsured = ticketValid && insuranceMarks.has(ticketNum)

  const addInsurance = () => {
    if (!ticketValid || locked) return
    setTicketInsured(ticketNum, true)
    setTicketInput('')
  }

  const clearInsurance = () => {
    if (!ticketValid || locked) return
    setTicketInsured(ticketNum, false)
    setTicketInput('')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl tracking-wide text-[var(--ink)]">Insurance</h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Mark tickets that bought insurance. They return once as regular; next draw is out.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-faint)]">Bought</p>
          <p className="font-display text-2xl text-[var(--safe)]">{insuredCount}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ticket-insure">Ticket number</Label>
        <div className="flex gap-2">
          <Input
            id="ticket-insure"
            inputMode="numeric"
            placeholder="e.g. 247"
            value={ticketInput}
            disabled={locked}
            onChange={(e) => setTicketInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (alreadyInsured) clearInsurance()
                else addInsurance()
              }
            }}
          />
          {alreadyInsured ? (
            <Button
              type="button"
              variant="secondary"
              disabled={locked || !ticketValid}
              onClick={clearInsurance}
            >
              <ShieldOff />
              Clear
            </Button>
          ) : (
            <Button
              type="button"
              disabled={locked || !ticketValid}
              onClick={addInsurance}
            >
              <Shield />
              Insure
            </Button>
          )}
        </div>
        {alreadyOut && (
          <p className="text-xs text-[var(--danger)]">Ticket {ticketNum} is already out.</p>
        )}
        {isHeld && !alreadyOut && (
          <p className="text-xs text-[var(--held)]">
            Ticket {ticketNum} is held out — right-click the board cell to bring it back first.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--ink-faint)]">
          {insuredList.length === 0
            ? 'No insurance purchased yet.'
            : `${insuredList.length} insured · click a number to remove`}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={locked || insuredCount === 0}
          onClick={clearAllInsurance}
        >
          Clear all
        </Button>
      </div>

      {insuredList.length > 0 && (
        <div className="max-h-40 overflow-y-auto border border-[var(--line)] bg-[var(--panel-elevated)] p-2">
          <div className="flex flex-wrap gap-1.5">
            {insuredList.map((n) => (
              <button
                key={n}
                type="button"
                disabled={locked}
                onClick={() => setTicketInsured(n, false)}
                className="rounded-sm border border-[var(--safe)]/40 bg-[rgba(90,168,122,0.12)] px-2 py-1 font-mono text-xs text-[var(--safe)] hover:bg-[rgba(90,168,122,0.24)] disabled:opacity-50"
                title="Click to remove insurance"
              >
                {formatTicket(n, digits)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
