/**
 * Offline activation codes for paid event use.
 * Codes are HMAC-signed. Issuing requires the same secret as verification.
 *
 * On successful activation the app is usable for 48 hours from activation time.
 */

const STORAGE_KEY = 'draw-down.license.v1'
/** Change this before shipping builds if you want to invalidate older generators. */
export const LICENSE_SECRET = 'draw-down-phillip-cooper-license-2026'

const HOURS_48_MS = 48 * 60 * 60 * 1000

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
}

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

export async function verifyLicenseCode(
  code: string,
  options?: { secret?: string; now?: number },
): Promise<{ ok: true; payload: IssuedPayload } | { ok: false; reason: string }> {
  const secret = options?.secret ?? LICENSE_SECRET
  // Strip whitespace; keep body case (base64url / JSON are case-sensitive)
  const raw = code.trim().replace(/\s+/g, '')
  const parts = raw.split('.')
  if (parts.length !== 3 || parts[0].toUpperCase() !== 'DD1') {
    return { ok: false, reason: 'Code format is invalid.' }
  }
  const [, body, sig] = parts
  const expected = toBase64Url(await hmacSha256(secret, body))
  if (expected !== sig) {
    return { ok: false, reason: 'Code is not valid.' }
  }
  try {
    const json = new TextDecoder().decode(fromBase64Url(body))
    const payload = JSON.parse(json) as IssuedPayload
    if (payload.v !== 1 || !Number.isFinite(payload.iat)) {
      return { ok: false, reason: 'Code payload is invalid.' }
    }
    // Codes must be activated within 30 days of issue (prevents infinite unused codes)
    const now = options?.now ?? Date.now()
    if (now > payload.iat * 1000 + 30 * 24 * 60 * 60 * 1000) {
      return { ok: false, reason: 'This code is too old to activate.' }
    }
    return { ok: true, payload }
  } catch {
    return { ok: false, reason: 'Code could not be read.' }
  }
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
