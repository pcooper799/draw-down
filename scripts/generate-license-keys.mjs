#!/usr/bin/env node
/**
 * Generate an Ed25519 keypair for Draw Down activation codes.
 *
 * - Public key → src/lib/licensePublicKey.ts (safe to commit / ship in the app)
 * - Private key → tools/license-issuer/private-key.json + keys.js (SELLER ONLY)
 *
 * Usage: npm run license:keys
 */
import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

ed.hashes.sha512 = (...msgs) => sha512(ed.etc.concatBytes(...msgs))

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const issuerDir = path.join(root, 'tools', 'license-issuer')
mkdirSync(issuerDir, { recursive: true })

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const pubRaw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)
const privRaw = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32)

const pubB64 = Buffer.from(pubRaw).toString('base64url')
const privB64 = Buffer.from(privRaw).toString('base64url')

// Sanity: public key derived from private matches exported public
const derived = await ed.getPublicKeyAsync(privRaw)
if (Buffer.compare(Buffer.from(derived), pubRaw) !== 0) {
  console.error('Keypair self-check failed')
  process.exit(1)
}

writeFileSync(
  path.join(root, 'src', 'lib', 'licensePublicKey.ts'),
  `/** Ed25519 public key (safe to ship in the customer app). */\nexport const LICENSE_PUBLIC_KEY_B64URL = '${pubB64}'\n`,
)

const keyDoc = {
  alg: 'Ed25519',
  privateKey: privB64,
  publicKey: pubB64,
  createdAt: new Date().toISOString(),
  note: 'SELLER ONLY — never ship this file inside the customer Draw Down app.',
}

writeFileSync(path.join(issuerDir, 'private-key.json'), JSON.stringify(keyDoc, null, 2) + '\n')
writeFileSync(
  path.join(issuerDir, 'keys.js'),
  `// SELLER ONLY — Ed25519 private key for offline code issuance.\nwindow.DRAW_DOWN_ISSUER_KEYS = ${JSON.stringify(
    {
      alg: 'Ed25519',
      privateKey: privB64,
      publicKey: pubB64,
    },
  )};\n`,
)

console.log('')
console.log('Ed25519 license keys generated')
console.log('------------------------------')
console.log('Public  → src/lib/licensePublicKey.ts  (commit this; ships in the app)')
console.log('Private → tools/license-issuer/private-key.json + keys.js  (seller only)')
console.log('')
console.log('Rebuild the customer app after rotating keys. Old DD2 codes will stop working.')
console.log('Legacy DD1 HMAC codes are unaffected.')
console.log('')
