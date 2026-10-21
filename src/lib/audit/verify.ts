import { AuditEngine } from '@/lib/audit/engine'
import { verifyHashChain } from '@/lib/audit/hashChain'
import { seedCommitment, seedFromHex, unbiasedIndex } from '@/lib/audit/rng'
import type { AuditEntry, AuditPackage } from '@/lib/audit/types'

export type CheckResult = {
  id: string
  label: string
  status: 'pass' | 'fail' | 'skip'
  detail?: string
}

export type VerifyReport = {
  ok: boolean
  checks: CheckResult[]
}

function check(
  id: string,
  label: string,
  status: CheckResult['status'],
  detail?: string,
): CheckResult {
  return { id, label, status, detail }
}

/** Independently reproduce draw_selection RNG traces from revealed seed. */
export function replaySelections(pkg: AuditPackage): CheckResult {
  if (!pkg.seed.revealed || !pkg.seed.seedHex) {
    return check('replay', 'Reproduce selections from seed', 'skip', 'Seed not revealed')
  }
  if (pkg.seed.commitment !== seedCommitment(seedFromHex(pkg.seed.seedHex))) {
    return check(
      'replay',
      'Reproduce selections from seed',
      'fail',
      'Revealed seed does not match commitment',
    )
  }

  const seed = seedFromHex(pkg.seed.seedHex)
  let counter = 0
  const draws = pkg.entries.filter((e) => e.type === 'draw_selection')

  for (const entry of draws) {
    const rng = entry.rng
    if (!rng?.eligibleSorted?.length) {
      return check('replay', 'Reproduce selections from seed', 'fail', `Missing RNG trace at seq ${entry.seq}`)
    }
    const pick = unbiasedIndex(seed, counter, rng.eligibleSorted.length)
    counter = pick.counterAfter
    const ticket = rng.eligibleSorted[pick.index]
    if (ticket !== entry.ticket || pick.index !== rng.index) {
      return check(
        'replay',
        'Reproduce selections from seed',
        'fail',
        `Mismatch at selection #${entry.selectionNumber}: expected ticket ${ticket}, audit has ${entry.ticket}`,
      )
    }
  }

  return check(
    'replay',
    'Reproduce selections from seed',
    'pass',
    `Reproduced ${draws.length} selection(s)`,
  )
}

export function verifyTicketTransitions(entries: AuditEntry[]): CheckResult {
  const eliminated = new Set<number>()
  const held = new Set<number>()
  const insured = new Set<number>()

  for (const e of entries) {
    if (e.type === 'insurance_marked' && e.ticket != null) insured.add(e.ticket)
    if (e.type === 'insurance_cleared' && e.ticket != null) insured.delete(e.ticket)
    if (e.type === 'hold' && e.ticket != null) {
      if (eliminated.has(e.ticket)) {
        return check('transitions', 'Ticket state transitions', 'fail', `Hold of eliminated #${e.ticket}`)
      }
      held.add(e.ticket)
    }
    if (e.type === 'release' && e.ticket != null) held.delete(e.ticket)
    if (e.type === 'draw_selection' && e.ticket != null) {
      if (eliminated.has(e.ticket)) {
        return check(
          'transitions',
          'Ticket state transitions',
          'fail',
          `Selection of already-eliminated #${e.ticket} at seq ${e.seq}`,
        )
      }
      if (held.has(e.ticket)) {
        return check(
          'transitions',
          'Ticket state transitions',
          'fail',
          `Selection of held #${e.ticket} at seq ${e.seq}`,
        )
      }
      if (e.permanentlyEliminated) {
        eliminated.add(e.ticket)
        insured.delete(e.ticket)
      } else if (e.insuranceConsumed) {
        insured.delete(e.ticket)
      }
    }
  }

  return check('transitions', 'Ticket state transitions', 'pass')
}

export function verifyAuditPackage(pkg: AuditPackage): VerifyReport {
  const checks: CheckResult[] = []

  if (pkg.format !== 'draw-down-audit-v1') {
    checks.push(check('format', 'Package format', 'fail', `Unknown format ${pkg.format}`))
  } else {
    checks.push(check('format', 'Package format', 'pass'))
  }

  const chain = verifyHashChain(pkg.entries)
  checks.push(
    check(
      'chain',
      'Tamper-evident hash chain',
      chain.ok ? 'pass' : 'fail',
      chain.ok ? `${chain.checked} entries` : chain.reason,
    ),
  )

  if (pkg.seed.commitment) {
    checks.push(check('commitment', 'Seed commitment present', 'pass', pkg.seed.commitment.slice(0, 16) + '…'))
  } else {
    checks.push(check('commitment', 'Seed commitment present', 'fail', 'Missing commitment'))
  }

  if (pkg.seed.revealed && pkg.seed.seedHex) {
    const match = seedCommitment(seedFromHex(pkg.seed.seedHex)) === pkg.seed.commitment
    checks.push(
      check(
        'seedMatch',
        'Revealed seed matches commitment',
        match ? 'pass' : 'fail',
      ),
    )
  } else {
    checks.push(
      check('seedMatch', 'Revealed seed matches commitment', 'skip', 'Seed not revealed yet'),
    )
  }

  checks.push(replaySelections(pkg))
  checks.push(verifyTicketTransitions(pkg.entries))

  const stops = pkg.entries.filter((e) => e.type === 'stop_reached')
  checks.push(
    check(
      'stops',
      'Automatic stopping points recorded',
      'pass',
      `${stops.length} stop event(s)`,
    ),
  )

  const ok = checks.every((c) => c.status !== 'fail')
  return { ok, checks }
}

export function engineFromPackage(pkg: AuditPackage, localSeedHex?: string) {
  return AuditEngine.fromLocalPersist({ package: pkg, localSeedHex })
}
