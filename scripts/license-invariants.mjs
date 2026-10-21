#!/usr/bin/env node
/**
 * License gate helpers: expired stays in review mode; only active runs live draws.
 */

function canRunLiveDrawings(status) {
  return status.state === 'active'
}

function canOpenInReviewMode(status) {
  return status.state === 'expired' || status.state === 'active'
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg)
    process.exit(1)
  }
}

assert(canRunLiveDrawings({ state: 'active', expiresAt: '', remainingMs: 1 }), 'active can draw')
assert(!canRunLiveDrawings({ state: 'expired', expiresAt: '' }), 'expired cannot draw')
assert(!canRunLiveDrawings({ state: 'missing' }), 'missing cannot draw')
assert(!canRunLiveDrawings({ state: 'invalid', reason: 'x' }), 'invalid cannot draw')

assert(canOpenInReviewMode({ state: 'expired', expiresAt: '' }), 'expired opens review')
assert(canOpenInReviewMode({ state: 'active', expiresAt: '', remainingMs: 1 }), 'active opens')
assert(!canOpenInReviewMode({ state: 'missing' }), 'missing needs activation gate')
assert(!canOpenInReviewMode({ state: 'invalid', reason: 'x' }), 'invalid needs activation gate')

// Hard-block policy used by App: block only when unlicensed AND not reviewable AND no live event
function hardBlocked(licensed, liveEvent, status) {
  return !licensed && !liveEvent && !canOpenInReviewMode(status)
}

assert(
  !hardBlocked(false, false, { state: 'expired', expiresAt: '' }),
  'expired without live event must not hard-block',
)
assert(
  hardBlocked(false, false, { state: 'missing' }),
  'missing without live event hard-blocks',
)
assert(
  !hardBlocked(false, true, { state: 'expired', expiresAt: '' }),
  'expired with live event stays in app',
)

console.log('OK license invariants')
