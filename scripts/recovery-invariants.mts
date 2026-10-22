#!/usr/bin/env npx tsx
/**
 * Crash-recovery reconstruction invariants (no Electron).
 */
import { AuditEngine } from '../src/lib/audit/engine.ts'
import {
  buildRecoveryAttachment,
  reconstructFromDurableBlob,
  replayTicketState,
  durableAheadOfLocal,
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

{
  const engine = new AuditEngine({
    eventName: 'Recovery QA',
    startingTickets: 40,
  })
  engine.append({
    type: 'event_created',
    details: { startingTickets: 40, stopAt: 5, paceMs: 600, orgName: 'Recovery QA' },
    eligibleBefore: 40,
    eligibleAfter: 40,
  })
  // Pre-start holds
  for (const t of [2, 4, 6]) {
    engine.append({
      type: 'hold',
      ticket: t,
      prevState: 'active',
      nextState: 'held',
      eligibleBefore: 40,
      eligibleAfter: 39,
    })
  }
  engine.append({ type: 'insurance_marked', ticket: 10, eligibleBefore: 37, eligibleAfter: 37 })
  engine.append({ type: 'insurance_marked', ticket: 11, eligibleBefore: 37, eligibleAfter: 37 })
  engine.commitSeed()
  engine.append({
    type: 'start',
    stopAt: 5,
    eligibleBefore: 37,
    eligibleAfter: 37,
    seedCommitment: engine.seed.commitment,
  })
  // Release one hold then eliminate it
  engine.append({
    type: 'release',
    ticket: 2,
    prevState: 'held',
    nextState: 'active',
    eligibleBefore: 37,
    eligibleAfter: 38,
  })

  // Simulate draws via append (not RNG) for deterministic state replay
  engine.append({
    type: 'draw_selection',
    selectionNumber: 1,
    ticket: 10,
    insuranceConsumed: true,
    permanentlyEliminated: false,
    prevState: 'insured',
    nextState: 'active',
    eligibleBefore: 38,
    eligibleAfter: 38,
    rng: {
      counter: 0,
      drawBytesHex: '00',
      index: 0,
      eligibleSorted: [1, 2, 3],
    },
  })
  engine.append({
    type: 'draw_selection',
    selectionNumber: 2,
    ticket: 2,
    insuranceConsumed: false,
    permanentlyEliminated: true,
    prevState: 'active',
    nextState: 'eliminated',
    eligibleBefore: 38,
    eligibleAfter: 37,
    rng: {
      counter: 1,
      drawBytesHex: '01',
      index: 0,
      eligibleSorted: [1, 2, 3],
    },
  })
  engine.append({
    type: 'draw_selection',
    selectionNumber: 3,
    ticket: 15,
    insuranceConsumed: false,
    permanentlyEliminated: true,
    prevState: 'active',
    nextState: 'eliminated',
    eligibleBefore: 37,
    eligibleAfter: 36,
    rng: {
      counter: 2,
      drawBytesHex: '02',
      index: 0,
      eligibleSorted: [1, 3, 5],
    },
  })

  const blob = engine.toLocalPersist() as LocalAuditBlob
  const recovery = buildRecoveryAttachment(blob, {
    ...DEFAULT_CONFIG,
    orgName: 'Recovery QA',
    totalTickets: 40,
    stopAt: 5,
    paceMs: 600,
    ticketScale: 1.2,
    prizeTiers: [5, 1],
  })
  assert('recovery attachment built', Boolean(recovery), recovery)
  blob.recovery = recovery

  // Chain verify may fail replay due to fake rng eligible lists — reconstruct uses verifyAuditPackage
  // For unit test of ticket replay, call replayTicketState directly.
  const state = replayTicketState(blob.package.entries, 40)
  assert('eliminated has 2 and 15', state.eliminated.includes(2) && state.eliminated.includes(15), state.eliminated)
  assert('10 no longer insured after return', !state.insuranceMarks.includes(10), state.insuranceMarks)
  assert('11 still insured', state.insuranceMarks.includes(11), state.insuranceMarks)
  assert('held still 4 and 6', state.heldOut.includes(4) && state.heldOut.includes(6), state.heldOut)
  assert(
    'preStartHeld keeps 2,4,6 even after 2 eliminated',
    state.preStartHeld.includes(2) &&
      state.preStartHeld.includes(4) &&
      state.preStartHeld.includes(6) &&
      state.preStartHeld.length === 3,
    state.preStartHeld,
  )
  assert('status paused', state.status === 'paused', state.status)
  assert('stopAt 5', state.stopAt === 5, state.stopAt)
  assert('remaining = 40 - 2 elim - 2 held = 36', state.remaining === 36, state.remaining)

  assert(
    'durable ahead of empty local',
    durableAheadOfLocal({
      durableDraws: 3,
      durableEliminated: 2,
      localDraws: 0,
      localEliminated: 0,
      localStatus: 'idle',
      sameEvent: true,
    }),
  )
  assert(
    'not ahead when local catches up',
    !durableAheadOfLocal({
      durableDraws: 3,
      durableEliminated: 2,
      localDraws: 3,
      localEliminated: 2,
      localStatus: 'paused',
      sameEvent: true,
    }),
  )
}

{
  // Tampered package fails reconstruct verify
  const engine = new AuditEngine({ eventName: 'Tamper', startingTickets: 10 })
  engine.append({
    type: 'event_created',
    details: { startingTickets: 10, stopAt: 1, paceMs: 1000 },
    eligibleBefore: 10,
    eligibleAfter: 10,
  })
  engine.commitSeed()
  const blob = engine.toLocalPersist() as LocalAuditBlob
  if (blob.package.entries[0]) {
    blob.package.entries[0] = { ...blob.package.entries[0], note: 'tampered' }
  }
  const result = reconstructFromDurableBlob(blob)
  assert('tampered fails', result.ok === false, result)
}

if (failures.length) {
  console.error('FAIL recovery invariants', failures)
  process.exit(1)
}
console.log('OK recovery invariants')
