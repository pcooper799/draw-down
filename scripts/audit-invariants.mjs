#!/usr/bin/env node
/**
 * Offline audit/RNG/hash-chain invariants (no React).
 * Mirrors src/lib/audit algorithms for CI without a bundler.
 */

import { createHash, randomBytes } from 'node:crypto'

const GENESIS = '0'.repeat(64)
const DOMAIN = Buffer.from('draw-down-rng-v1')

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      if (key === 'hash') continue
      out[key] = canonicalize(value[key])
    }
    return out
  }
  return value
}

function hashEntry(body) {
  return sha256Hex(Buffer.from(JSON.stringify(canonicalize(body)), 'utf8'))
}

function counterBytes(counter) {
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  return buf
}

function rngBlock(seed, counter) {
  return createHash('sha256')
    .update(Buffer.concat([seed, counterBytes(counter), DOMAIN]))
    .digest()
}

function unbiasedIndex(seed, startCounter, n) {
  if (n === 1) return { index: 0, counterAfter: startCounter, bytes: Buffer.alloc(0) }
  const limit = Math.floor(0x100000000 / n) * n
  let counter = startCounter
  const consumed = []
  for (let guard = 0; guard < 10000; guard += 1) {
    const block = rngBlock(seed, counter)
    counter += 1
    const value = block.readUInt32BE(0)
    consumed.push(block[0], block[1], block[2], block[3])
    if (value < limit) {
      return { index: value % n, counterAfter: counter, bytes: Buffer.from(consumed) }
    }
  }
  throw new Error('rejection failed')
}

function append(entries, partial) {
  const body = {
    seq: entries.length + 1,
    prevHash: entries.length ? entries[entries.length - 1].hash : GENESIS,
    at: new Date().toISOString(),
    eventId: 'evt_test',
    eventName: 'Test',
    operatorId: 'local-operator',
    ...partial,
  }
  const entry = { ...body, hash: hashEntry(body) }
  entries.push(entry)
  return entry
}

function verifyChain(entries) {
  let prev = GENESIS
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]
    if (e.seq !== i + 1 || e.prevHash !== prev) return false
    const { hash, ...body } = e
    if (hashEntry(body) !== hash) return false
    prev = hash
  }
  return true
}

const failures = []
function assert(name, cond, detail) {
  if (!cond) failures.push({ name, detail })
}

// Hash chain
{
  const entries = []
  append(entries, { type: 'event_created' })
  append(entries, { type: 'seed_committed', seedCommitment: 'abc' })
  append(entries, { type: 'draw_selection', ticket: 1, selectionNumber: 1 })
  assert('chain verifies', verifyChain(entries), entries)
  entries[1].ticket = 99
  assert('tamper detected', !verifyChain(entries), null)
}

// Commitment
{
  const seed = randomBytes(32)
  const commitment = sha256Hex(seed)
  assert('commitment length', commitment.length === 64, commitment)
  assert('commitment stable', sha256Hex(seed) === commitment, null)
}

// Unbiased replay
{
  const seed = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex')
  const eligible = Array.from({ length: 1500 }, (_, i) => i + 1)
  let counter = 0
  const picks = []
  for (let i = 0; i < 50; i += 1) {
    const r = unbiasedIndex(seed, counter, eligible.length)
    counter = r.counterAfter
    picks.push(eligible[r.index])
  }
  // replay
  counter = 0
  for (let i = 0; i < picks.length; i += 1) {
    const r = unbiasedIndex(seed, counter, eligible.length)
    counter = r.counterAfter
    assert(`replay ${i}`, eligible[r.index] === picks[i], { got: eligible[r.index], exp: picks[i] })
  }
}

// Chi-square-ish sanity for small n (not a full statistical proof)
{
  const seed = randomBytes(32)
  const n = 7
  const counts = Array(n).fill(0)
  let counter = 0
  const trials = 7000
  for (let i = 0; i < trials; i += 1) {
    const r = unbiasedIndex(seed, counter, n)
    counter = r.counterAfter
    counts[r.index] += 1
  }
  const expected = trials / n
  let chi = 0
  for (const c of counts) chi += (c - expected) ** 2 / expected
  // df=6 critical ~16.8 at 1%; allow generous bound
  assert('unbiased-ish chi-square', chi < 40, { chi, counts })
}

// Insurance remaining count invariant (eligible unchanged on consume)
{
  let pool = [
    { n: 1, insured: true },
    { n: 2, insured: false },
    { n: 3, insured: false },
  ]
  // consume insurance on 1
  pool = pool.map((t) => (t.n === 1 ? { ...t, insured: false } : t))
  assert('insurance consume keeps count', pool.length === 3, pool)
  pool = pool.filter((t) => t.n !== 1)
  assert('second draw eliminates', pool.length === 2, pool)
}

if (failures.length) {
  console.error('FAIL audit invariants', failures)
  process.exit(1)
}
console.log('OK audit invariants')
