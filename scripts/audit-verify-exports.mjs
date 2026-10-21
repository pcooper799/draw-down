#!/usr/bin/env node
/**
 * Offline dual-file audit verifier.
 *
 *   npm run audit:verify -- --json path/to/audit.json --csv path/to/audit.csv
 *
 * Exit 0 = all checks passed (skips allowed). Exit 1 = any failure.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { verifyJsonAndCsv } from './lib/audit-verify-core.mjs'

function usage() {
  console.log(`Usage:
  npm run audit:verify -- --json <audit.json> --csv <audit.csv>

Loads both exports, runs cryptographic hash-chain / seed / replay checks on the
JSON (authoritative), and cross-checks every CSV row against the JSON entries.
`)
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--json') out.json = argv[++i]
    else if (a === '--csv') out.csv = argv[++i]
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.json || !args.csv) {
    usage()
    process.exit(args.help ? 0 : 2)
  }

  let pkg
  try {
    pkg = JSON.parse(readFileSync(resolve(args.json), 'utf8'))
  } catch (e) {
    console.error('FAIL could not read JSON:', e.message)
    process.exit(1)
  }
  if (pkg.format !== 'draw-down-audit-v1') {
    console.error('FAIL JSON is not a draw-down-audit-v1 package')
    process.exit(1)
  }

  let csvText
  try {
    csvText = readFileSync(resolve(args.csv), 'utf8')
  } catch (e) {
    console.error('FAIL could not read CSV:', e.message)
    process.exit(1)
  }

  const report = verifyJsonAndCsv(pkg, csvText)
  console.log('')
  console.log(report.ok ? 'VERIFICATION PASSED' : 'VERIFICATION FAILED')
  console.log(`Event: ${report.summary.eventName} (${report.summary.eventId})`)
  console.log(`Entries: ${report.summary.entries} · JSON crypto: ${report.summary.jsonOk ? 'ok' : 'FAIL'} · CSV cross-check: ${report.summary.csvCrossOk ? 'ok' : 'FAIL'}`)
  console.log('')
  for (const c of report.checks) {
    const mark = c.status === 'pass' ? 'PASS' : c.status === 'fail' ? 'FAIL' : 'SKIP'
    console.log(`  [${mark}] ${c.label}${c.detail ? ` — ${c.detail}` : ''}`)
  }
  console.log('')
  if (!report.ok) {
    console.log('Tamper or inconsistency detected. Treat the export as untrusted until investigated.')
    process.exit(1)
  }
  console.log('JSON hash chain / seed checks and CSV↔JSON agreement all look good.')
  process.exit(0)
}

main()
