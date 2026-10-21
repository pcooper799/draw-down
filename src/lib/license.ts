/**
 * Offline activation codes for paid event use.
 *
 * Preferred: DD2… codes signed with Ed25519 (private key only on the seller
 * issuer; this app ships only the public key).
 *
 * Legacy: DD1… HMAC codes still verify for older activations.
 *
 * On successful activation, live drawings are unlocked for 48 hours from
 * activation time. After expiry, organizers can still open the app to review
 * audit logs, verify results, and export reports — only starting or resuming
 * a live draw requires a new code.
 */

import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'
import { LICENSE_PUBLIC_KEY_B64URL } from '@/lib/licensePublicKey'

ed.hashes.sha512 = (...msgs) => sha512(ed.etc.concatBytes(...msgs))

const STORAGE_KEY = 'draw-down.license.v1'
/** Legacy HMAC secret — kept so already-issued DD1 codes still activate. */
export const LICENSE_SECRET = 'draw-down-phillip-cooper-license-2026'

const HOURS_48_MS = 48 * 60 * 60 * 1000
const ISSUE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export type LicenseRecord = {
  code: string
  activatedAt: string
  expiresAt: string
}

export type LicenseStatus =
  | { state: 'missing' }
  | { state: 'invalid'; reason: string }
  | { state: 'expired'; expiresAt: string }
  | { state: 'active'; expiresAt: string; remainingMs: number }

function toBase64Url(bytes: Uint8Array | string) {
  const buf = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let bin = ''
  for (const b of buf) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string) {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacSha256(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return new Uint8Array(sig)
}

export type IssuedPayload = {
  v: 1
  /** Issued-at unix seconds */
  iat: number
  /** Optional label for your records */
  label?: string
  /** Optional uniqueness nonce (local issuer UI batching) */
  n?: number
}

function parsePayload(body: string): IssuedPayload | null {
  try {
    const json = new TextDecoder().decode(fromBase64Url(body))
    const payload = JSON.parse(json) as IssuedPayload
    if (payload.v !== 1 || !Number.isFinite(payload.iat)) return null
    return payload
  } catch {
    return null
  }
}

function withinIssueWindow(payload: IssuedPayload, now: number) {
  return now <= payload.iat * 1000 + ISSUE_WINDOW_MS
}

/** Issue a modern Ed25519-signed code (requires the seller private key). */
export async function issueLicenseCodeEd25519(options: {
  privateKeyB64Url: string
  label?: string
  now?: number
}) {
  const payload: IssuedPayload = {
    v: 1,
    iat: Math.floor((options.now ?? Date.now()) / 1000),
    label: options.label,
    n: Math.floor(Math.random() * 1e9),
  }
  const body = toBase64Url(JSON.stringify(payload))
  const priv = fromBase64Url(options.privateKeyB64Url)
  const sig = await ed.signAsync(new TextEncoder().encode(body), priv)
  return `DD2.${body}.${toBase64Url(sig)}`
}

/** @deprecated Prefer Ed25519 (DD2). Kept for tooling that still mints HMAC codes. */
export async function issueLicenseCode(options?: {
  secret?: string
  label?: string
  now?: number
}) {
  const secret = options?.secret ?? LICENSE_SECRET
  const payload: IssuedPayload = {
    v: 1,
    iat: Math.floor((options?.now ?? Date.now()) / 1000),
    label: options?.label,
  }
  const body = toBase64Url(JSON.stringify(payload))
  const sig = toBase64Url(await hmacSha256(secret, body))
  return `DD1.${body}.${sig}`
}

async function verifyDd1(body: string, sig: string, secret: string) {
  const expected = toBase64Url(await hmacSha256(secret, body))
  return expected === sig
}

async function verifyDd2(body: string, sig: string, publicKeyB64Url: string) {
  const pub = fromBase64Url(publicKeyB64Url)
  const signature = fromBase64Url(sig)
  if (signature.length !== 64 || pub.length !== 32) return false
  return ed.verifyAsync(signature, new TextEncoder().encode(body), pub)
}

export async function verifyLicenseCode(
  code: string,
  options?: { secret?: string; publicKeyB64Url?: string; now?: number },
): Promise<{ ok: true; payload: IssuedPayload } | { ok: false; reason: string }> {
  const raw = code.trim().replace(/\s+/g, '')
  const parts = raw.split('.')
  if (parts.length !== 3) {
    return { ok: false, reason: 'Code format is invalid.' }
  }
  const [version, body, sig] = parts
  const ver = version.toUpperCase()

  let signedOk = false
  if (ver === 'DD2') {
    signedOk = await verifyDd2(body, sig, options?.publicKeyB64Url ?? LICENSE_PUBLIC_KEY_B64URL)
  } else if (ver === 'DD1') {
    signedOk = await verifyDd1(body, sig, options?.secret ?? LICENSE_SECRET)
  } else {
    return { ok: false, reason: 'Code format is invalid.' }
  }

  if (!signedOk) {
    return { ok: false, reason: 'Code is not valid.' }
  }

  const payload = parsePayload(body)
  if (!payload) {
    return { ok: false, reason: 'Code payload is invalid.' }
  }

  const now = options?.now ?? Date.now()
  if (!withinIssueWindow(payload, now)) {
    return { ok: false, reason: 'This code is too old to activate.' }
  }

  return { ok: true, payload }
}

export function readLicenseRecord(): LicenseRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as LicenseRecord
    if (!data?.expiresAt || !data?.activatedAt) return null
    return data
  } catch {
    return null
  }
}

export function writeLicenseRecord(record: LicenseRecord) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
}

export function clearLicenseRecord() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getLicenseStatus(now = Date.now()): LicenseStatus {
  const record = readLicenseRecord()
  if (!record) return { state: 'missing' }
  const expires = Date.parse(record.expiresAt)
  if (!Number.isFinite(expires)) return { state: 'invalid', reason: 'Saved license is corrupt.' }
  if (now >= expires) return { state: 'expired', expiresAt: record.expiresAt }
  return { state: 'active', expiresAt: record.expiresAt, remainingMs: expires - now }
}

/** Live start/resume/continue — requires an active (non-expired) license. */
export function canRunLiveDrawings(status: LicenseStatus): boolean {
  return status.state === 'active'
}

/**
 * After a prior activation expires, organizers keep read/verify/export access.
 * Fresh installs (missing) and corrupt records still need a code to enter.
 */
export function canOpenInReviewMode(status: LicenseStatus): boolean {
  return status.state === 'expired' || status.state === 'active'
}

export async function activateLicenseCode(code: string, now = Date.now()) {
  const verified = await verifyLicenseCode(code, { now })
  if (!verified.ok) return verified
  const record: LicenseRecord = {
    code: code.trim(),
    activatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + HOURS_48_MS).toISOString(),
  }
  writeLicenseRecord(record)
  return { ok: true as const, record }
}

export function formatRemaining(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}
