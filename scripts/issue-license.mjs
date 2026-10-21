#!/usr/bin/env node
/**
 * Issue a Draw Down activation code (7 days of use after the customer activates).
 *
 * Prefers Ed25519 (DD2) when tools/license-issuer/private-key.json exists.
 * Falls back to legacy HMAC (DD1) otherwise.
 *
 * Usage:
 *   npm run license:issue
 *   npm run license:issue -- --label "Friday gala"
 */
import { createHmac } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

ed.hashes.sha512 = (...msgs) => sha512(ed.etc.concatBytes(...msgs))

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = path.join(root, 'tools', 'license-issuer', 'private-key.json')
const LEGACY_SECRET = process.env.LICENSE_SECRET || 'draw-down-phillip-cooper-license-2026'

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

const args = process.argv.slice(2)
let label
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--label') label = args[i + 1]
}

const payload = {
  v: 1,
  iat: Math.floor(Date.now() / 1000),
  n: Math.floor(Math.random() * 1e9),
}
if (label) payload.label = label

const body = toBase64Url(JSON.stringify(payload))
let code
let mode

if (existsSync(keyPath)) {
  const keys = JSON.parse(readFileSync(keyPath, 'utf8'))
  const priv = Buffer.from(keys.privateKey, 'base64url')
  const sig = await ed.signAsync(Buffer.from(body, 'utf8'), priv)
  code = `DD2.${body}.${toBase64Url(sig)}`
  mode = 'Ed25519 (DD2)'
} else {
  const sig = toBase64Url(createHmac('sha256', LEGACY_SECRET).update(body).digest())
  code = `DD1.${body}.${sig}`
  mode = 'legacy HMAC (DD1) — run npm run license:keys for Ed25519'
}

console.log('')
console.log('Draw Down activation code')
console.log('-------------------------')
console.log(code)
console.log('')
console.log(`Signing: ${mode}`)
console.log('Customer gets 7 days of use starting when they activate.')
console.log('Code includes signed issue time (iat); must activate within 30 days of issue.')
console.log('Code can be activated within 30 days of issue.')
if (label) console.log(`Label: ${label}`)
console.log('')
