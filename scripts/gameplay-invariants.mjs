#!/usr/bin/env node
/**
 * Pure gameplay invariant checks (no React). Fail the process on regression.
 */

const MIN_TICKETS = 1
const MAX_TICKETS = 2500
const MIN_STOP_AT = 1

function clampTotalTickets(total, stopAt = MIN_STOP_AT) {
  const safeStop = Math.max(MIN_STOP_AT, stopAt)
  if (!Number.isFinite(total)) return Math.max(safeStop, 1)
  return Math.min(MAX_TICKETS, Math.max(safeStop, Math.floor(total)))
}

function clampStopAt(stopAt, totalTickets) {
  const total = clampTotalTickets(totalTickets, MIN_STOP_AT)
  if (!Number.isFinite(stopAt)) return MIN_STOP_AT
  return Math.min(total, Math.max(MIN_STOP_AT, Math.floor(stopAt)))
}

function canInsureTicket(ticket, totalTickets, eliminated) {
  if (!Number.isFinite(ticket)) return false
  const n = Math.floor(ticket)
  if (n < 1 || n > totalTickets) return false
  return !new Set(eliminated).has(n)
}

function pruneInsuranceMarks(marks, totalTickets, eliminated) {
  const out = new Set(eliminated)
  const next = new Set()
  for (const n of marks) {
    if (Number.isFinite(n) && n >= 1 && n <= totalTickets && !out.has(n)) next.add(n)
  }
  return next
}

function hasLiveEventProgress({ status, eliminatedCount, historyCount }) {
  return (
    status === 'running' ||
    status === 'paused' ||
    eliminatedCount > 0 ||
    historyCount > 0
  )
}

function buildPool(total, insured) {
  return Array.from({ length: total }, (_, i) => ({
    number: i + 1,
    insured: insured.has(i + 1),
  }))
}

function simulate({ total, stopAt, insuredSet, picks }) {
  let pool = buildPool(total, new Set(insuredSet))
  let marks = new Set(insuredSet)
  const eliminated = []
  const draws = []
  let i = 0
  while (pool.length > stopAt && i < 100000) {
    const index = picks ? picks[i % picks.length] % pool.length : 0
    const ticket = pool[index]
    const event = {
      ticket: ticket.number,
      insured: ticket.insured,
      outcome: ticket.insured ? 'returned' : 'eliminated',
    }
    draws.push(event)
    if (ticket.insured) {
      marks.delete(ticket.number)
      pool = pool.map((t) =>
        t.number === ticket.number ? { ...t, insured: false } : t,
      )
    } else {
      pool = pool.filter((t) => t.number !== ticket.number)
      eliminated.unshift(ticket.number)
      marks.delete(ticket.number)
    }
    i += 1
  }
  return { remaining: pool.length, pool, eliminated, marks, draws }
}

const failures = []
function assert(name, cond, detail) {
  if (!cond) failures.push({ name, detail })
}

{
  const r = simulate({
    total: 5,
    stopAt: 1,
    insuredSet: [1, 2, 3, 4, 5],
    picks: Array(20).fill(0),
  })
  // Last remaining ticket is never drawn (stopAt), so it keeps unused insurance.
  assert(
    'all-insured draw-down stops at one remaining',
    r.remaining === 1 &&
      r.draws.filter((d) => d.outcome === 'returned').length === 4 &&
      r.draws.filter((d) => d.outcome === 'eliminated').length === 4 &&
      r.pool[0]?.insured === true,
    r,
  )
}

{
  const r = simulate({ total: 5, stopAt: 5, insuredSet: [], picks: [0] })
  assert('stopAt equals total means no draws', r.draws.length === 0 && r.remaining === 5, r)
}

assert('cannot insure eliminated', !canInsureTicket(3, 10, [3]), null)
assert('can insure active', canInsureTicket(4, 10, [3]), null)
assert(
  'prune drops out-of-range and eliminated',
  [...pruneInsuranceMarks([1, 3, 99], 10, [1])].join(',') === '3',
  null,
)
assert('clamp total max', clampTotalTickets(99999, 1) === MAX_TICKETS, null)
assert('clamp stopAt <= total', clampStopAt(50, 10) === 10, null)
assert(
  'live progress protects mid-event',
  hasLiveEventProgress({ status: 'paused', eliminatedCount: 2, historyCount: 2 }),
  null,
)
assert(
  'fresh idle is not live',
  !hasLiveEventProgress({ status: 'idle', eliminatedCount: 0, historyCount: 0 }),
  null,
)

// Double-start guard simulation
{
  let status = 'idle'
  let drawLock = false
  let draws = 0
  const start = () => {
    if (status === 'running' || drawLock) return
    drawLock = true
    status = 'running'
    draws += 1
  }
  start()
  start()
  start()
  assert('double-start only draws once', draws === 1 && status === 'running', { draws, status })
}

if (failures.length) {
  console.error('FAIL', failures)
  process.exit(1)
}
console.log('OK gameplay invariants')
