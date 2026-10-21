#!/usr/bin/env node
import {
  auditPackageToCsv,
  hashEntry,
  verifyJsonAndCsv,
  GENESIS,
} from './lib/audit-verify-core.mjs'

function append(entries, partial) {
  const body = {
    seq: entries.length + 1,
    prevHash: entries.length ? entries[entries.length - 1].hash : GENESIS,
    at: new Date(Date.UTC(2026, 0, 1, 12, entries.length)).toISOString(),
    eventId: 'evt_test_verify',
    eventName: 'Verifier Test',
    operatorId: 'local-operator',
    ...partial,
  }
  const entry = { ...body, hash: hashEntry(body) }
  entries.push(entry)
  return entry
}

const entries = []
append(entries, { type: 'event_created', eligibleBefore: 5, eligibleAfter: 5 })
append(entries, {
  type: 'seed_committed',
  seedCommitment: 'a'.repeat(64),
  note: 'commit',
})
append(entries, {
  type: 'draw_selection',
  selectionNumber: 1,
  ticket: 3,
  prevState: 'active',
  nextState: 'eliminated',
  eligibleBefore: 5,
  eligibleAfter: 4,
  permanentlyEliminated: true,
  rng: { counter: 0, drawBytesHex: '00', index: 0, eligibleSorted: [1, 2, 3, 4, 5] },
})

const pkg = {
  format: 'draw-down-audit-v1',
  eventId: 'evt_test_verify',
  eventName: 'Verifier Test',
  createdAt: entries[0].at,
  updatedAt: entries[entries.length - 1].at,
  startingTickets: 5,
  seed: { commitment: 'a'.repeat(64), revealed: false, counter: 1 },
  entries,
  finalized: false,
}

const goodCsv = auditPackageToCsv(pkg)
const good = verifyJsonAndCsv(pkg, goodCsv)
if (!good.ok) {
  console.error('expected good export to pass', good.checks.filter((c) => c.status === 'fail'))
  process.exit(1)
}

// Tamper CSV ticket field on the draw_selection row
const badCsv = goodCsv
  .split('\n')
  .map((line) => (line.includes('draw_selection') ? line.replace('"3"', '"99"') : line))
  .join('\n')
const bad = verifyJsonAndCsv(pkg, badCsv)
if (bad.ok || !bad.checks.some((c) => c.id === 'csvFields' && c.status === 'fail')) {
  console.error('expected CSV ticket edit to fail csvFields', bad.checks)
  process.exit(1)
}

// Tamper JSON hash
const tampered = structuredClone(pkg)
tampered.entries[2].ticket = 99
const badJson = verifyJsonAndCsv(tampered, auditPackageToCsv(pkg))
if (badJson.ok || !badJson.checks.some((c) => c.id === 'chain' && c.status === 'fail')) {
  // hash still old so chain should fail; also csv mismatch
  if (!badJson.checks.some((c) => c.status === 'fail')) {
    console.error('expected tampered JSON to fail')
    process.exit(1)
  }
}

console.log('OK audit-verify-exports')
