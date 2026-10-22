#!/usr/bin/env npx tsx
/** Extra recovery edge cases (corrupt / multi / stale) without Electron UI. */
import { AuditEngine } from '../src/lib/audit/engine.ts'
import {
  durableAheadOfLocal,
  reconstructFromDurableBlob,
} from '../src/lib/audit/reconstructSession.ts'
import type { LocalAuditBlob } from '../src/lib/audit/persist.ts'
import { DEFAULT_CONFIG } from '../src/types.ts'

const failures: string[] = []
function assert(name: string, cond: unknown, detail?: unknown) {
  if (!cond) {
    failures.push(name)
    console.error('FAIL', name, detail ?? '')
  }
}

function makeBlob(name: string, draws: number): LocalAuditBlob {
  const engine = new AuditEngine({ eventName: name, startingTickets: 30 })
  engine.append({
    type: 'event_created',
    details: { startingTickets: 30, stopAt: 1, paceMs: 500, orgName: name },
    eligibleBefore: 30,
    eligibleAfter: 30,
  })
  engine.commitSeed()
  engine.append({
    type: 'start',
    stopAt: 1,
    eligibleBefore: 30,
    eligibleAfter: 30,
    seedCommitment: engine.seed.commitment,
  })
  let pool = Array.from({ length: 30 }, (_, i) => i + 1)
  for (let i = 0; i < draws; i += 1) {
    const pick = engine.pickUnbiasedIndex(pool)
    engine.append({
      type: 'draw_selection',
      selectionNumber: i + 1,
      ticket: pick.ticket,
      insuranceConsumed: false,
      permanentlyEliminated: true,
      prevState: 'active',
      nextState: 'eliminated',
      eligibleBefore: pool.length,
      eligibleAfter: pool.length - 1,
      rng: pick.rng,
      stopAt: 1,
    })
    pool = pool.filter((t) => t !== pick.ticket)
  }
  return engine.toLocalPersist() as LocalAuditBlob
}

{
  const good = makeBlob('Multi A', 3)
  const good2 = makeBlob('Multi B', 5)
  const a = reconstructFromDurableBlob(good)
  const b = reconstructFromDurableBlob(good2)
  assert('multi A ok', a.ok && a.ok && a.drawCount === 3, a)
  assert('multi B ok', b.ok && b.ok && b.drawCount === 5, b)
  if (a.ok && b.ok) {
    assert('different event ids', a.snapshot.eventId !== b.snapshot.eventId)
  }
}

{
  const blob = makeBlob('Corrupt', 2)
  // Break hash chain
  if (blob.package.entries[1]) {
    blob.package.entries[1] = { ...blob.package.entries[1], note: 'evil' }
  }
  const bad = reconstructFromDurableBlob(blob)
  assert('corrupt rejected', bad.ok === false, bad)
}

{
  // Stale local: fewer draws than durable
  assert(
    'stale local detected',
    durableAheadOfLocal({
      durableDraws: 10,
      durableEliminated: 10,
      localDraws: 2,
      localEliminated: 2,
      localStatus: 'paused',
      sameEvent: true,
    }),
  )
}

{
  // Insurance consumption in reconstruction
  const engine = new AuditEngine({ eventName: 'Ins', startingTickets: 20 })
  engine.append({
    type: 'event_created',
    details: { startingTickets: 20, stopAt: 1, paceMs: 500, orgName: 'Ins' },
    eligibleBefore: 20,
    eligibleAfter: 20,
  })
  engine.append({ type: 'insurance_marked', ticket: 5 })
  engine.commitSeed()
  engine.append({ type: 'start', stopAt: 1, seedCommitment: engine.seed.commitment })
  engine.append({
    type: 'draw_selection',
    selectionNumber: 1,
    ticket: 5,
    insuranceConsumed: true,
    permanentlyEliminated: false,
    prevState: 'insured',
    nextState: 'active',
    eligibleBefore: 20,
    eligibleAfter: 20,
    rng: { counter: 0, drawBytesHex: 'aa', index: 0, eligibleSorted: [5] },
  })
  engine.append({
    type: 'draw_selection',
    selectionNumber: 2,
    ticket: 5,
    insuranceConsumed: false,
    permanentlyEliminated: true,
    prevState: 'active',
    nextState: 'eliminated',
    eligibleBefore: 20,
    eligibleAfter: 19,
    rng: { counter: 1, drawBytesHex: 'bb', index: 0, eligibleSorted: [5] },
  })
  // Bypass full verify (fake rng) — use replayTicketState via reconstruct after fixing chain
  // Build properly with real picks instead:
}

{
  const engine = new AuditEngine({ eventName: 'Ins2', startingTickets: 20 })
  engine.append({
    type: 'event_created',
    details: { startingTickets: 20, stopAt: 1, paceMs: 500, orgName: 'Ins2' },
    eligibleBefore: 20,
    eligibleAfter: 20,
  })
  engine.append({ type: 'insurance_marked', ticket: 7 })
  engine.commitSeed()
  engine.append({ type: 'start', stopAt: 1, seedCommitment: engine.seed.commitment })
  let pool = Array.from({ length: 20 }, (_, i) => i + 1)
  // First hit insured 7 by forcing append only if we pick until 7 — use direct append with valid chain
  // Real picks:
  for (let n = 0; n < 40 && pool.includes(7); n += 1) {
    const pick = engine.pickUnbiasedIndex(pool)
    const insured = pick.ticket === 7 && engine.entries.some((e) => e.type === 'insurance_marked' && e.ticket === 7) &&
      !engine.entries.some((e) => e.type === 'draw_selection' && e.ticket === 7 && e.insuranceConsumed)
    const firstIns = pick.ticket === 7 && !engine.entries.some((e) => e.type === 'draw_selection' && e.ticket === 7)
    engine.append({
      type: 'draw_selection',
      selectionNumber: engine.entries.filter((e) => e.type === 'draw_selection').length + 1,
      ticket: pick.ticket,
      insuranceConsumed: firstIns,
      permanentlyEliminated: !firstIns,
      prevState: firstIns ? 'insured' : 'active',
      nextState: firstIns ? 'active' : 'eliminated',
      eligibleBefore: pool.length,
      eligibleAfter: firstIns ? pool.length : pool.length - 1,
      rng: pick.rng,
    })
    if (!firstIns) pool = pool.filter((t) => t !== pick.ticket)
    if (pick.ticket === 7 && !firstIns) break
  }
  const blob = engine.toLocalPersist() as LocalAuditBlob
  const r = reconstructFromDurableBlob(blob, { ...DEFAULT_CONFIG, orgName: 'Ins2', totalTickets: 20 })
  assert('insurance event verifies', r.ok === true, r)
  if (r.ok) {
    assert('7 eliminated after second hit', r.snapshot.eliminated.includes(7), r.snapshot.eliminated)
    assert('7 not still insured', !r.snapshot.insuranceMarks.includes(7), r.snapshot.insuranceMarks)
  }
}

if (failures.length) {
  console.error('FAIL recovery-extra', failures)
  process.exit(1)
}
console.log('OK recovery-extra invariants')
