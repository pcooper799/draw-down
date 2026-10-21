#!/usr/bin/env node
/**
 * Issue a Draw Down activation code (48h of use after the customer activates).
 *
 * Usage:
 *   npm run license:issue
 *   npm run license:issue -- --label "Friday gala"
 *   LICENSE_SECRET=your-secret npm run license:issue
 *
 * The secret must match LICENSE_SECRET in src/lib/license.ts (or set the same
 * value in both places before you ship).
 */
import { createHmac } from 'node:crypto'

const SECRET = process.env.LICENSE_SECRET || 'draw-down-phillip-cooper-license-2026'

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
  label,
}

const body = toBase64Url(JSON.stringify(payload))
const sig = toBase64Url(createHmac('sha256', SECRET).update(body).digest())
const code = `DD1.${body}.${sig}`

console.log('')
console.log('Draw Down activation code')
console.log('-------------------------')
console.log(code)
console.log('')
console.log('Customer gets 48 hours of use starting when they activate.')
console.log('Code can be activated within 30 days of issue.')
if (label) console.log(`Label: ${label}`)
console.log('')
