import type { AuditPackage } from '@/lib/audit/types'
import type { AuditEngine } from '@/lib/audit/engine'

const LOCAL_PREFIX = 'draw-down.audit.local.v1:'

export type LocalAuditBlob = {
  package: AuditPackage
  localSeedHex?: string
}

export function localAuditKey(eventId: string) {
  return `${LOCAL_PREFIX}${eventId}`
}

export function writeLocalAudit(engine: AuditEngine) {
  const blob = engine.toLocalPersist() as LocalAuditBlob
  try {
    localStorage.setItem(localAuditKey(engine.eventId), JSON.stringify(blob))
  } catch {
    // quota
  }
  // Durable Electron mirror (best-effort await by caller)
  return blob
}

export function readLocalAudit(eventId: string): LocalAuditBlob | null {
  try {
    const raw = localStorage.getItem(localAuditKey(eventId))
    if (!raw) return null
    return JSON.parse(raw) as LocalAuditBlob
  } catch {
    return null
  }
}

export async function flushAuditDurable(blob: LocalAuditBlob) {
  if (window.drawDown?.auditSave) {
    await window.drawDown.auditSave(blob)
  }
}

export function downloadAuditJson(pkg: AuditPackage, filename?: string) {
  const name = filename ?? `draw-down-audit-${pkg.eventName.replace(/\s+/g, '-')}-${pkg.eventId.slice(0, 12)}.json`
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Metadata header so the offline Audit Verifier can cross-check event identity. */
export const AUDIT_CSV_FORMAT = 'draw-down-audit-csv-v1'

export function auditPackageToCsv(pkg: AuditPackage): string {
  const meta = [
    `# ${AUDIT_CSV_FORMAT}`,
    `# eventId=${pkg.eventId}`,
    `# eventName=${String(pkg.eventName).replace(/\n/g, ' ')}`,
    `# startingTickets=${pkg.startingTickets}`,
    `# seedCommitment=${pkg.seed?.commitment || ''}`,
    `# seedRevealed=${pkg.seed?.revealed ? 'true' : 'false'}`,
    `# entryCount=${pkg.entries.length}`,
  ]
  const header = [
    'seq',
    'at',
    'type',
    'selectionNumber',
    'ticket',
    'prevState',
    'nextState',
    'eligibleBefore',
    'eligibleAfter',
    'insuranceConsumed',
    'permanentlyEliminated',
    'stopAt',
    'hash',
  ]
  const rows = pkg.entries.map((e) =>
    [
      e.seq,
      e.at,
      e.type,
      e.selectionNumber ?? '',
      e.ticket ?? '',
      e.prevState ?? '',
      e.nextState ?? '',
      e.eligibleBefore ?? '',
      e.eligibleAfter ?? '',
      e.insuranceConsumed ?? '',
      e.permanentlyEliminated ?? '',
      e.stopAt ?? '',
      e.hash,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  )
  return [...meta, header.join(','), ...rows].join('\n')
}

export function downloadAuditCsv(pkg: AuditPackage) {
  const csv = auditPackageToCsv(pkg)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `draw-down-audit-${pkg.eventId.slice(0, 12)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export async function readAuditPackageFromFile(file: File): Promise<AuditPackage | null> {
  try {
    const text = await file.text()
    const data = JSON.parse(text) as AuditPackage
    if (data.format !== 'draw-down-audit-v1') return null
    return data
  } catch {
    return null
  }
}
