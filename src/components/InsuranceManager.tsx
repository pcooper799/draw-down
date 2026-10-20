import { useMemo, useState } from 'react'
import { Shield, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
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
    setTicketInsured,
    setRangeInsured,
    setPercentInsured,
    clearAllInsurance,
    digits,
  } = session

  const [search, setSearch] = useState('')
  const [rangeFrom, setRangeFrom] = useState('1')
  const [rangeTo, setRangeTo] = useState('10')
  const [percent, setPercent] = useState(10)

  const insuredList = useMemo(
    () => [...insuranceMarks].sort((a, b) => a - b),
    [insuranceMarks],
  )

  const searchNum = Number.parseInt(search, 10)
  const searchValid =
    Number.isFinite(searchNum) && searchNum >= 1 && searchNum <= config.totalTickets
  const searchInsured = searchValid && insuranceMarks.has(searchNum)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl tracking-wide text-[var(--ink)]">Insurance</h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Insured tickets return to the pool when drawn.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-faint)]">Marked</p>
          <p className="font-display text-2xl text-[var(--safe)]">{insuredCount}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ticket-search">Find ticket number</Label>
        <div className="flex gap-2">
          <Input
            id="ticket-search"
            inputMode="numeric"
            placeholder="e.g. 247"
            value={search}
            disabled={locked}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            type="button"
            variant={searchInsured ? 'secondary' : 'default'}
            disabled={locked || !searchValid}
            onClick={() => setTicketInsured(searchNum, !searchInsured)}
          >
            {searchInsured ? <ShieldOff /> : <Shield />}
            {searchInsured ? 'Clear' : 'Insure'}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Mark range</Label>
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2">
          <Input
            inputMode="numeric"
            value={rangeFrom}
            disabled={locked}
            onChange={(e) => setRangeFrom(e.target.value)}
            aria-label="Range from"
          />
          <Input
            inputMode="numeric"
            value={rangeTo}
            disabled={locked}
            onChange={(e) => setRangeTo(e.target.value)}
            aria-label="Range to"
          />
          <Button
            type="button"
            size="sm"
            disabled={locked}
            onClick={() => {
              const from = Number.parseInt(rangeFrom, 10)
              const to = Number.parseInt(rangeTo, 10)
              if (!Number.isFinite(from) || !Number.isFinite(to)) return
              setRangeInsured(from, to, true)
            }}
          >
            Insure range
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={locked}
            onClick={() => {
              const from = Number.parseInt(rangeFrom, 10)
              const to = Number.parseInt(rangeTo, 10)
              if (!Number.isFinite(from) || !Number.isFinite(to)) return
              setRangeInsured(from, to, false)
            }}
          >
            Clear range
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Random percent insured</Label>
          <span className="text-sm text-[var(--ink-muted)]">{percent}%</span>
        </div>
        <Slider
          value={[percent]}
          min={0}
          max={100}
          step={1}
          disabled={locked}
          onValueChange={(v) => setPercent(v[0] ?? 0)}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={locked}
          onClick={() => setPercentInsured(percent)}
        >
          Apply random {percent}% insurance
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--ink-faint)]">
          {insuredList.length === 0
            ? 'No insured tickets yet.'
            : `Showing ${Math.min(insuredList.length, 48)} of ${insuredList.length}`}
        </p>
        <Button type="button" variant="ghost" size="sm" disabled={locked || insuredCount === 0} onClick={clearAllInsurance}>
          Clear all
        </Button>
      </div>

      {insuredList.length > 0 && (
        <div className="max-h-40 overflow-y-auto border border-[var(--line)] bg-[var(--panel-elevated)] p-2">
          <div className="flex flex-wrap gap-1.5">
            {insuredList.slice(0, 48).map((n) => (
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
