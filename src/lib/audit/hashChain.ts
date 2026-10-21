import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { AuditEntry } from '@/lib/audit/types'

/** Stable JSON for hashing — sorted keys, no `hash` field. */
export function canonicalizeForHash(entry: Omit<AuditEntry, 'hash'>): string {
  return JSON.stringify(sortValue(entry))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      if (key === 'hash') continue
      out[key] = sortValue(obj[key])
    }
    return out
  }
  return value
}

export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  return bytesToHex(sha256(bytes))
}

export function hashAuditEntry(entry: Omit<AuditEntry, 'hash'>): string {
  return sha256Hex(canonicalizeForHash(entry))
}

export type ChainVerifyResult = {
  ok: boolean
  checked: number
  brokenAtSeq?: number
  reason?: string
}

export function verifyHashChain(entries: AuditEntry[]): ChainVerifyResult {
  let prev = '0'.repeat(64)
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!
    if (entry.seq !== i + 1) {
      return { ok: false, checked: i, brokenAtSeq: entry.seq, reason: `Unexpected seq at index ${i}` }
    }
    if (entry.prevHash !== prev) {
      return {
        ok: false,
        checked: i,
        brokenAtSeq: entry.seq,
        reason: `prevHash mismatch at seq ${entry.seq}`,
      }
    }
    const { hash, ...body } = entry
    const expected = hashAuditEntry(body)
    if (hash !== expected) {
      return {
        ok: false,
        checked: i,
        brokenAtSeq: entry.seq,
        reason: `Hash mismatch at seq ${entry.seq}`,
      }
    }
    prev = hash
  }
  return { ok: true, checked: entries.length }
}
