import type { AuditPackage } from '@/lib/audit/types'
import type { AuditEngine } from '@/lib/audit/engine'
import type { SessionSnapshot } from '@/lib/sessionPersist'
import { parseSnapshot } from '@/lib/sessionPersist'

const LOCAL_PREFIX = 'draw-down.audit.local.v1:'

export type RecoveryAttachment = {
  v: 1
  savedAt: string
  session: SessionSnapshot
}

export type LocalAuditBlob = {
  package: AuditPackage
  /** Unrevealed seed — required to continue drawing after crash recovery. */
  localSeedHex?: string
  /** UI + ticket checkpoint written atomically with the audit package. */
  recovery?: RecoveryAttachment
}

export function localAuditKey(eventId: string) {
  return `${LOCAL_PREFIX}${eventId}`
}

export function writeLocalAudit(engine: AuditEngine, recovery?: RecoveryAttachment) {
  const blob = engine.toLocalPersist() as LocalAuditBlob
  if (recovery) blob.recovery = recovery
  try {
    localStorage.setItem(localAuditKey(engine.eventId), JSON.stringify(blob))
  } catch {
    // quota
  }
  return blob
}

export function readLocalAudit(eventId: string): LocalAuditBlob | null {
  try {
    const raw = localStorage.getItem(localAuditKey(eventId))
    if (!raw) return null
    return parseDurableBlob(JSON.parse(raw))
  } catch {
    return null
  }
}

export function parseDurableBlob(raw: unknown): LocalAuditBlob | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<LocalAuditBlob>
  if (!data.package || typeof data.package !== 'object') return null
  if (data.package.format !== 'draw-down-audit-v1') return null
  let recovery: RecoveryAttachment | undefined
  if (data.recovery && data.recovery.v === 1 && data.recovery.session) {
    const session = parseSnapshot(data.recovery.session)
    if (session) {
      recovery = {
        v: 1,
        savedAt:
          typeof data.recovery.savedAt === 'string'
            ? data.recovery.savedAt
            : new Date().toISOString(),
        session,
      }
    }
  }
  return {
    package: data.package,
    localSeedHex: typeof data.localSeedHex === 'string' ? data.localSeedHex : undefined,
    recovery,
  }
}

export async function flushAuditDurable(blob: LocalAuditBlob) {
  if (window.drawDown?.auditSave) {
    return window.drawDown.auditSave(blob)
  }
  return { ok: false as const, reason: 'no-electron' }
}

export async function listDurableAudits(): Promise<
  Array<{ eventId: string; mtimeMs: number; blob: LocalAuditBlob }>
> {
  if (!window.drawDown?.auditList) return []
  const res = await window.drawDown.auditList()
  if (!res?.ok || !Array.isArray(res.items)) return []
  const out: Array<{ eventId: string; mtimeMs: number; blob: LocalAuditBlob }> = []
  for (const item of res.items) {
    const blob = parseDurableBlob(item.blob)
    if (!blob) continue
    out.push({
      eventId: blob.package.eventId,
      mtimeMs: Number(item.mtimeMs) || 0,
      blob,
    })
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

export async function archiveDurableAudit(eventId: string) {
  if (!window.drawDown?.auditArchive) {
    return { ok: false as const, reason: 'no-electron' }
  }
  return window.drawDown.auditArchive(eventId)
}

export function downloadAuditJson(pkg: AuditPackage, filename?: string) {
  const name =
    filename ??
    `draw-down-audit-${pkg.eventName.replace(/\s+/g, '-')}-${pkg.eventId.slice(0, 12)}.json`
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
