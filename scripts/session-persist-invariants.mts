#!/usr/bin/env npx tsx
/**
 * Session persistence invariants (real parseSnapshot / toSnapshot).
 * Covers BUG-001: preStartHeld must survive elimination of those tickets.
 */
import { canMarkTicketHeld, normalizeTicketList } from '../src/lib/drawRules.ts'
import {
  buildPoolFromSnapshot,
  parseSnapshot,
  toSnapshot,
  type SessionSnapshot,
} from '../src/lib/sessionPersist.ts'
import { DEFAULT_CONFIG } from '../src/types.ts'

const failures: string[] = []

function assert(name: string, cond: unknown, detail?: unknown) {
  if (!cond) {
    failures.push(name)
    console.error('FAIL', name, detail ?? '')
  }
}

const PRE_START_HELD = [3, 11, 19, 27, 33, 41, 55, 66, 88, 99]
const ELIMINATED = [3, 11, 19] // three of the pre-start holds, later released then drawn out
const STILL_HELD = [27, 33]

{
  // Pure contract: permission normalize must not take eliminated as exclude.
  const kept = normalizeTicketList(PRE_START_HELD, 400)
  assert('normalize keeps all 10 without exclude', kept.length === 10, kept)
  const wrong = normalizeTicketList(PRE_START_HELD, 400, ELIMINATED)
  assert(
    'normalize with eliminated exclude drops three (the old bug shape)',
    wrong.length === 7,
    wrong,
  )
}

{
  const live = {
    config: {
      ...DEFAULT_CONFIG,
      totalTickets: 400,
      stopAt: 10,
      orgName: 'BUG-001 Regression',
    },
    insuranceMarks: new Set<number>([41]),
    eliminated: [...ELIMINATED],
    heldOut: [...STILL_HELD],
    preStartHeld: [...PRE_START_HELD],
    history: [
      {
        id: 'd1',
        ticket: 3,
        insured: false,
        outcome: 'eliminated' as const,
        at: Date.now(),
      },
    ],
    lastDrawn: null,
    status: 'paused' as const,
    eventId: 'evt_bug001_regression',
  }

  const snap = toSnapshot(live)
  assert(
    'toSnapshot writes all 10 preStartHeld',
    JSON.stringify(snap.preStartHeld) === JSON.stringify([...PRE_START_HELD].sort((a, b) => a - b)),
    snap.preStartHeld,
  )

  const restored = parseSnapshot(snap)
  assert('parseSnapshot returns snapshot', Boolean(restored), restored)
  assert(
    'restored preStartHeld still has all 10 original entries',
    restored != null &&
      restored.preStartHeld?.length === 10 &&
      JSON.stringify(restored.preStartHeld) ===
        JSON.stringify([...PRE_START_HELD].sort((a, b) => a - b)),
    restored?.preStartHeld,
  )

  // heldOut still excludes eliminated
  assert(
    'heldOut does not include eliminated',
    restored != null &&
      restored.heldOut?.every((n) => !ELIMINATED.includes(n)) &&
      restored.heldOut.length === 2,
    restored?.heldOut,
  )

  // Pool must not contain eliminated or held tickets
  const pool = buildPoolFromSnapshot(
    400,
    restored!.eliminated,
    new Set(restored!.insuranceMarks),
    restored!.heldOut ?? [],
  )
  assert(
    'pool excludes eliminated and held',
    !pool.some((t) => ELIMINATED.includes(t.number) || STILL_HELD.includes(t.number)),
    pool.filter((t) => ELIMINATED.includes(t.number) || STILL_HELD.includes(t.number)),
  )

  // Post-start hold gate: eliminated ticket still cannot be marked held via pool rules;
  // canMarkTicketHeld may allow permission but UI/toggle rejects eliminated first.
  const gateElim = canMarkTicketHeld({
    ticket: 3,
    drawHasStarted: true,
    preStartHeld: restored!.preStartHeld ?? [],
    currentlyHeld: false,
  })
  assert(
    'permission set still lists eliminated pre-start ticket',
    gateElim.ok === true,
    gateElim,
  )
  const gateNew = canMarkTicketHeld({
    ticket: 7,
    drawHasStarted: true,
    preStartHeld: restored!.preStartHeld ?? [],
    currentlyHeld: false,
  })
  assert('post-start new hold still blocked', gateNew.ok === false, gateNew)

  // Range + dedupe still applied
  const dirty: SessionSnapshot = {
    ...snap,
    preStartHeld: [...PRE_START_HELD, 3, 0, 401, 11, Number.NaN],
  }
  const cleaned = parseSnapshot(dirty)
  assert(
    'out-of-range and dupes stripped; 10 remain',
    cleaned != null && cleaned.preStartHeld?.length === 10,
    cleaned?.preStartHeld,
  )
}

{
  // Older saves without preStartHeld remain loadable (compat fallback → heldOut).
  const legacy = {
    version: 1 as const,
    savedAt: new Date().toISOString(),
    config: { ...DEFAULT_CONFIG, totalTickets: 50, stopAt: 5 },
    insuranceMarks: [],
    eliminated: [4],
    heldOut: [2, 6],
    history: [{ id: 'h', ticket: 4, insured: false, outcome: 'eliminated' as const, at: 1 }],
    lastDrawn: null,
    status: 'paused' as const,
  }
  const parsed = parseSnapshot(legacy)
  assert('legacy without preStartHeld parses', Boolean(parsed), parsed)
  assert(
    'legacy fallback uses current heldOut only',
    parsed != null &&
      JSON.stringify(parsed.preStartHeld) === JSON.stringify([2, 6]),
    parsed?.preStartHeld,
  )
}

if (failures.length) {
  console.error('FAIL session-persist invariants', failures)
  process.exit(1)
}
console.log('OK session-persist invariants')
