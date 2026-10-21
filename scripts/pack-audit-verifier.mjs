#!/usr/bin/env node
/**
 * Zip tools/audit-verifier for organizer distribution (no private keys — public-safe).
 */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'tools/audit-verifier')
const outDir = resolve(root, 'release/tools')
const zipPath = resolve(outDir, 'Draw-Down-Audit-Verifier.zip')

mkdirSync(outDir, { recursive: true })
const staging = resolve(outDir, 'Draw-Down-Audit-Verifier')
execSync(`rm -rf "${staging}" && mkdir -p "${staging}" && cp -a "${src}/." "${staging}/"`)
execSync(`cd "${outDir}" && rm -f Draw-Down-Audit-Verifier.zip && zip -r Draw-Down-Audit-Verifier.zip Draw-Down-Audit-Verifier -x '*.DS_Store'`)
console.log('Wrote', zipPath)

// Also copy into Cursor agent stores / artifacts when present
const copies = [
  '/opt/cursor/artifacts/Draw-Down-Audit-Verifier.zip',
  '/cursor/stores/self/seller-only/Draw-Down-Audit-Verifier.zip',
  '/cursor/stores/bc-fb98413f-1015-486e-8282-27061ead29b0/seller-only/Draw-Down-Audit-Verifier.zip',
]
for (const dest of copies) {
  try {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(zipPath, dest)
    console.log('Copied', dest)
  } catch {
    // store may be unavailable
  }
}
