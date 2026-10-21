import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

/**
 * Deterministic CSPRNG: SHA-256(seed || counter_be64 || domain) → 32 bytes.
 * Unbiased index via rejection sampling (no modulo bias).
 */

const DOMAIN = new TextEncoder().encode('draw-down-rng-v1')

export function randomSeedBytes(bytes = 32): Uint8Array {
  const out = new Uint8Array(bytes)
  crypto.getRandomValues(out)
  return out
}

export function seedCommitment(seed: Uint8Array): string {
  return bytesToHex(sha256(seed))
}

/** Mix optional public witness into a fresh seed: SHA-256(secret || witness). */
export function deriveSeed(secret: Uint8Array, witness?: string): Uint8Array {
  if (!witness?.trim()) return secret
  const w = new TextEncoder().encode(witness.trim())
  const buf = new Uint8Array(secret.length + w.length)
  buf.set(secret, 0)
  buf.set(w, secret.length)
  return sha256(buf)
}

function counterBytes(counter: number): Uint8Array {
  const view = new DataView(new ArrayBuffer(8))
  // Big-endian uint64 (counter fits JS safe integer for event lengths)
  const hi = Math.floor(counter / 2 ** 32)
  const lo = counter >>> 0
  view.setUint32(0, hi)
  view.setUint32(4, lo)
  return new Uint8Array(view.buffer)
}

export function rngBlock(seed: Uint8Array, counter: number): Uint8Array {
  const c = counterBytes(counter)
  const buf = new Uint8Array(seed.length + c.length + DOMAIN.length)
  buf.set(seed, 0)
  buf.set(c, seed.length)
  buf.set(DOMAIN, seed.length + c.length)
  return sha256(buf)
}

/**
 * Unbiased index in [0, n). Uses rejection sampling over 32-bit window.
 * Returns bytes consumed (hex) for audit replay.
 */
export function unbiasedIndex(
  seed: Uint8Array,
  startCounter: number,
  n: number,
): { index: number; counterAfter: number; drawBytesHex: string } {
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('unbiasedIndex: n must be positive')
  }
  if (n === 1) {
    return { index: 0, counterAfter: startCounter, drawBytesHex: '' }
  }

  const limit = Math.floor(0x100000000 / n) * n
  let counter = startCounter
  const consumed: number[] = []

  for (let guard = 0; guard < 10_000; guard += 1) {
    const block = rngBlock(seed, counter)
    counter += 1
    // take first 4 bytes as uint32 BE
    const value =
      ((block[0]! << 24) | (block[1]! << 16) | (block[2]! << 8) | block[3]!) >>> 0
    consumed.push(block[0]!, block[1]!, block[2]!, block[3]!)
    if (value < limit) {
      return {
        index: value % n,
        counterAfter: counter,
        drawBytesHex: bytesToHex(new Uint8Array(consumed)),
      }
    }
  }
  throw new Error('unbiasedIndex: rejection sampling failed')
}

export function seedFromHex(hex: string): Uint8Array {
  return hexToBytes(hex)
}

export function seedToHex(seed: Uint8Array): string {
  return bytesToHex(seed)
}
