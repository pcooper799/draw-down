import type { AuditPackage } from '@/lib/audit/types'
import { verifyAuditPackage, type VerifyReport } from '@/lib/audit/verify'

export type AuditSummary = {
  eventName: string
  eventId: string
  date: string
  startingTickets: number
  finalEligibleEstimate: number | null
  totalSelections: number
  permanentEliminations: number
  insuranceConsumptions: number
  holdEvents: number
  releaseEvents: number
  stopEvents: number
  durationLabel: string
  seedCommitment: string
  seedRevealed: boolean
  verification: VerifyReport
  stops: Array<{ at: string; ticket?: number; remaining?: number; stopAt?: number }>
}

export function summarizeAudit(pkg: AuditPackage): AuditSummary {
  const draws = pkg.entries.filter((e) => e.type === 'draw_selection')
  const first = pkg.entries[0]?.at ?? pkg.createdAt
  const last = pkg.entries[pkg.entries.length - 1]?.at ?? pkg.updatedAt
  const ms = Date.parse(last) - Date.parse(first)
  const mins = Math.max(0, Math.round(ms / 60000))
  const lastEligible = [...pkg.entries].reverse().find((e) => e.eligibleAfter != null)?.eligibleAfter ?? null

  return {
    eventName: pkg.eventName,
    eventId: pkg.eventId,
    date: pkg.createdAt.slice(0, 10),
    startingTickets: pkg.startingTickets,
    finalEligibleEstimate: lastEligible,
    totalSelections: draws.length,
    permanentEliminations: draws.filter((d) => d.permanentlyEliminated).length,
    insuranceConsumptions: draws.filter((d) => d.insuranceConsumed).length,
    holdEvents: pkg.entries.filter((e) => e.type === 'hold').length,
    releaseEvents: pkg.entries.filter((e) => e.type === 'release').length,
    stopEvents: pkg.entries.filter((e) => e.type === 'stop_reached').length,
    durationLabel: mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`,
    seedCommitment: pkg.seed.commitment,
    seedRevealed: pkg.seed.revealed,
    verification: verifyAuditPackage(pkg),
    stops: pkg.entries
      .filter((e) => e.type === 'stop_reached')
      .map((e) => ({
        at: e.at,
        ticket: e.ticket,
        remaining: e.eligibleAfter,
        stopAt: e.stopAt,
      })),
  }
}

/** Offline printable report (browser print → PDF). No network. */
export function openPrintableAuditReport(pkg: AuditPackage) {
  const s = summarizeAudit(pkg)
  const checks = s.verification.checks
    .map(
      (c) =>
        `<tr><td>${c.status.toUpperCase()}</td><td>${escapeHtml(c.label)}</td><td>${escapeHtml(c.detail ?? '')}</td></tr>`,
    )
    .join('')
  const stops = s.stops
    .map(
      (st) =>
        `<tr><td>${escapeHtml(st.at)}</td><td>${st.ticket ?? '—'}</td><td>${st.remaining ?? '—'}</td><td>${st.stopAt ?? '—'}</td></tr>`,
    )
    .join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Audit — ${escapeHtml(s.eventName)}</title>
  <style>
    body{font-family:Figtree,Segoe UI,sans-serif;color:#1a1206;margin:2rem;line-height:1.45}
    h1{font-family:Impact,Arial Black,sans-serif;letter-spacing:.04em;margin:0 0 .5rem}
    h2{margin:1.5rem 0 .5rem;font-size:1.1rem}
    table{border-collapse:collapse;width:100%;margin:.5rem 0 1rem}
    th,td{border:1px solid #ccc;padding:.4rem .55rem;text-align:left;font-size:.9rem}
    th{background:#f3e6c8}
    .meta{color:#555;font-size:.95rem}
    .ok{color:#1b6b3a;font-weight:700}
    .bad{color:#a33}
    code{font-size:.8rem;word-break:break-all}
  </style></head><body>
  <h1>DRAW DOWN — AUDIT REPORT</h1>
  <p class="meta">${escapeHtml(s.eventName)} · ${escapeHtml(s.date)} · Event ID <code>${escapeHtml(s.eventId)}</code></p>
  <p class="${s.verification.ok ? 'ok' : 'bad'}">Verification: ${s.verification.ok ? 'PASSED' : 'FAILED / INCOMPLETE'}</p>
  <h2>Summary</h2>
  <table>
    <tr><th>Starting tickets</th><td>${s.startingTickets}</td></tr>
    <tr><th>Final eligible (last recorded)</th><td>${s.finalEligibleEstimate ?? '—'}</td></tr>
    <tr><th>Selections</th><td>${s.totalSelections}</td></tr>
    <tr><th>Permanent eliminations</th><td>${s.permanentEliminations}</td></tr>
    <tr><th>Insurance consumptions</th><td>${s.insuranceConsumptions}</td></tr>
    <tr><th>Holds / releases</th><td>${s.holdEvents} / ${s.releaseEvents}</td></tr>
    <tr><th>Prize stops</th><td>${s.stopEvents}</td></tr>
    <tr><th>Duration</th><td>${escapeHtml(s.durationLabel)}</td></tr>
    <tr><th>Seed commitment (SHA-256)</th><td><code>${escapeHtml(s.seedCommitment || '—')}</code></td></tr>
    <tr><th>Seed revealed</th><td>${s.seedRevealed ? 'Yes' : 'No (reveal after event to enable full replay)'}</td></tr>
  </table>
  <h2>Prize stopping points</h2>
  <table><thead><tr><th>Time</th><th>Displayed ticket</th><th>Remaining</th><th>Stop at</th></tr></thead><tbody>
  ${stops || '<tr><td colspan="4">None</td></tr>'}
  </tbody></table>
  <h2>Verification checks</h2>
  <table><thead><tr><th>Status</th><th>Check</th><th>Detail</th></tr></thead><tbody>${checks}</tbody></table>
  <p class="meta">This report does not by itself prove the original seed was generated fairly — only that recorded selections match the documented algorithm and hash chain for the committed seed when revealed. Offline · Draw Down</p>
  <script>window.onload=()=>window.print()</script>
  </body></html>`

  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  return true
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
