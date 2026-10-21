import { useMemo, useRef, useState } from 'react'
import { FileJson, FileText, Search, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  downloadAuditCsv,
  downloadAuditJson,
  openPrintableAuditReport,
  readAuditPackageFromFile,
  verifyAuditPackage,
  type AuditEntry,
  type AuditPackage,
  type CheckResult,
} from '@/lib/audit'
import type { DrawSession } from '@/hooks/useDrawSession'

type Props = {
  session: DrawSession
  locked?: boolean
}

export function AuditPanel({ session, locked = false }: Props) {
  const [ticketQuery, setTicketQuery] = useState('')
  const [verifyChecks, setVerifyChecks] = useState<CheckResult[] | null>(null)
  const [importNote, setImportNote] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const entries = session.auditEntries
  const filtered = useMemo(() => {
    const q = ticketQuery.trim()
    if (!q) return entries.slice().reverse()
    const n = Number.parseInt(q, 10)
    return entries
      .filter((e) => (Number.isFinite(n) ? e.ticket === n : e.type.includes(q.toLowerCase())))
      .slice()
      .reverse()
  }, [entries, ticketQuery])

  const runVerify = (pkg?: AuditPackage) => {
    const pack = pkg ?? session.exportAuditPackage()
    const report = verifyAuditPackage(pack)
    setVerifyChecks(report.checks)
    setImportNote(report.ok ? 'Verification passed' : 'Verification found problems')
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-xl tracking-wide text-[var(--ink)]">Audit & verification</h3>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Offline tamper-evident log of selections, holds, insurance, and stops. Export before revealing
          the seed if you want a public commitment record.
        </p>
      </div>

      <div className="space-y-1 text-xs text-[var(--ink-faint)]">
        <p>
          Event ID: <span className="font-mono text-[var(--ink-muted)]">{session.eventId}</span>
        </p>
        <p className="break-all">
          Seed commitment:{' '}
          <span className="font-mono text-[var(--ink-muted)]">
            {session.seedCommitment ?? 'Created on first Start'}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={locked}
          onClick={() => runVerify()}
        >
          <ShieldCheck />
          Verify drawing
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={locked || session.seedRevealed}
          onClick={() => void session.revealAuditSeed()}
        >
          Reveal seed
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked}
          onClick={() => downloadAuditJson(session.exportAuditPackage())}
        >
          <FileJson />
          Export JSON
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked}
          onClick={() => downloadAuditCsv(session.exportAuditPackage())}
        >
          <FileText />
          Export CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="col-span-2"
          disabled={locked}
          onClick={() => openPrintableAuditReport(session.exportAuditPackage())}
        >
          Print / PDF report
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="col-span-2"
          disabled={locked}
          onClick={() => importRef.current?.click()}
        >
          Import audit JSON to verify
        </Button>
      </div>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          void readAuditPackageFromFile(file).then((pkg) => {
            if (!pkg) {
              setImportNote('Could not read audit package')
              return
            }
            runVerify(pkg)
          })
          e.target.value = ''
        }}
      />

      {importNote && <p className="text-xs text-[var(--accent)]">{importNote}</p>}

      {verifyChecks && (
        <ul className="max-h-36 space-y-1 overflow-y-auto border border-[var(--line)] bg-[var(--panel-elevated)] p-2 text-xs">
          {verifyChecks.map((c) => (
            <li key={c.id} className="flex gap-2">
              <span
                className={
                  c.status === 'pass'
                    ? 'text-[var(--safe)]'
                    : c.status === 'fail'
                      ? 'text-[var(--danger)]'
                      : 'text-[var(--ink-faint)]'
                }
              >
                {c.status}
              </span>
              <span className="text-[var(--ink-muted)]">
                {c.label}
                {c.detail ? ` — ${c.detail}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <Label htmlFor="audit-ticket-search">Search ticket / type</Label>
        <div className="flex gap-2">
          <Input
            id="audit-ticket-search"
            value={ticketQuery}
            onChange={(e) => setTicketQuery(e.target.value)}
            placeholder="e.g. 247 or hold"
          />
          <Button type="button" variant="outline" size="icon" aria-label="Search">
            <Search />
          </Button>
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto border border-[var(--line)] bg-[var(--panel-elevated)]/80">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-[var(--ink-faint)]">No audit entries yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {filtered.slice(0, 80).map((e) => (
              <AuditRow key={`${e.seq}-${e.hash}`} entry={e} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <li className="px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[var(--ink)]">#{entry.seq}</span>
        <span className="text-[var(--ink-faint)]">{new Date(entry.at).toLocaleTimeString()}</span>
      </div>
      <p className="mt-0.5 text-[var(--ink-muted)]">
        {entry.type}
        {entry.ticket != null ? ` · ticket ${entry.ticket}` : ''}
        {entry.selectionNumber != null ? ` · sel ${entry.selectionNumber}` : ''}
        {entry.eligibleBefore != null
          ? ` · ${entry.eligibleBefore}→${entry.eligibleAfter ?? '—'}`
          : ''}
      </p>
    </li>
  )
}
