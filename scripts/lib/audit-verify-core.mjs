/**
 * Offline audit verification core (Node).
 * Mirrors src/lib/audit hash-chain, seed replay, transitions, and CSV↔JSON checks.
 * No private keys. Safe to ship publicly.
 */

import { createHash } from 'node:crypto'

export const GENESIS = '0'.repeat(64)
export const DOMAIN = Buffer.from('draw-down-rng-v1')
export const CSV_FORMAT = 'draw-down-audit-csv-v1'

export function sha256Hex(buf) {
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

export function hashEntry(body) {
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

export function seedCommitment(seedBuf) {
  return sha256Hex(seedBuf)
}

export function unbiasedIndex(seed, startCounter, n) {
  if (n === 1) return { index: 0, counterAfter: startCounter }
  const limit = Math.floor(0x100000000 / n) * n
  let counter = startCounter
  for (let guard = 0; guard < 10000; guard += 1) {
    const block = rngBlock(seed, counter)
    counter += 1
    const value = block.readUInt32BE(0)
    if (value < limit) return { index: value % n, counterAfter: counter }
  }
  throw new Error('rejection sampling failed')
}

function check(id, label, status, detail) {
  return { id, label, status, detail }
}

export function verifyHashChain(entries) {
  let prev = GENESIS
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    if (entry.seq !== i + 1) {
      return {
        ok: false,
        checked: i,
        brokenAtSeq: entry.seq,
        reason: `Unexpected seq at index ${i} (got ${entry.seq})`,
      }
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
    const expected = hashEntry(body)
    if (hash !== expected) {
      return {
        ok: false,
        checked: i,
        brokenAtSeq: entry.seq,
        reason: `Hash mismatch at seq ${entry.seq} (entry was altered)`,
      }
    }
    prev = hash
  }
  return { ok: true, checked: entries.length }
}

export function replaySelections(pkg) {
  if (!pkg.seed?.revealed || !pkg.seed?.seedHex) {
    return check('replay', 'Reproduce selections from seed', 'skip', 'Seed not revealed')
  }
  const seed = Buffer.from(pkg.seed.seedHex, 'hex')
  if (seedCommitment(seed) !== pkg.seed.commitment) {
    return check(
      'replay',
      'Reproduce selections from seed',
      'fail',
      'Revealed seed does not match commitment',
    )
  }
  let counter = 0
  const draws = pkg.entries.filter((e) => e.type === 'draw_selection')
  for (const entry of draws) {
    const rng = entry.rng
    if (!rng?.eligibleSorted?.length) {
      return check('replay', 'Reproduce selections from seed', 'fail', `Missing RNG trace at seq ${entry.seq}`)
    }
    const pick = unbiasedIndex(seed, counter, rng.eligibleSorted.length)
    counter = pick.counterAfter
    const ticket = rng.eligibleSorted[pick.index]
    if (ticket !== entry.ticket || pick.index !== rng.index) {
      return check(
        'replay',
        'Reproduce selections from seed',
        'fail',
        `Mismatch at selection #${entry.selectionNumber}: expected ${ticket}, audit has ${entry.ticket}`,
      )
    }
  }
  return check('replay', 'Reproduce selections from seed', 'pass', `Reproduced ${draws.length} selection(s)`)
}

export function verifyTicketTransitions(entries) {
  const eliminated = new Set()
  const held = new Set()
  const insured = new Set()
  for (const e of entries) {
    if (e.type === 'insurance_marked' && e.ticket != null) insured.add(e.ticket)
    if (e.type === 'insurance_cleared' && e.ticket != null) insured.delete(e.ticket)
    if (e.type === 'hold' && e.ticket != null) {
      if (eliminated.has(e.ticket)) {
        return check('transitions', 'Ticket state transitions', 'fail', `Hold of eliminated #${e.ticket}`)
      }
      held.add(e.ticket)
    }
    if (e.type === 'release' && e.ticket != null) held.delete(e.ticket)
    if (e.type === 'draw_selection' && e.ticket != null) {
      if (eliminated.has(e.ticket)) {
        return check(
          'transitions',
          'Ticket state transitions',
          'fail',
          `Selection of already-eliminated #${e.ticket} at seq ${e.seq}`,
        )
      }
      if (held.has(e.ticket)) {
        return check(
          'transitions',
          'Ticket state transitions',
          'fail',
          `Selection of held #${e.ticket} at seq ${e.seq}`,
        )
      }
      if (e.permanentlyEliminated) {
        eliminated.add(e.ticket)
        insured.delete(e.ticket)
      } else if (e.insuranceConsumed) {
        insured.delete(e.ticket)
      }
    }
  }
  return check('transitions', 'Ticket state transitions', 'pass')
}

export function verifyAuditPackage(pkg) {
  const checks = []
  if (pkg.format !== 'draw-down-audit-v1') {
    checks.push(check('format', 'Package format', 'fail', `Unknown format ${pkg.format}`))
  } else {
    checks.push(check('format', 'Package format', 'pass'))
  }

  const chain = verifyHashChain(pkg.entries || [])
  checks.push(
    check(
      'chain',
      'Tamper-evident hash chain',
      chain.ok ? 'pass' : 'fail',
      chain.ok ? `${chain.checked} entries` : chain.reason,
    ),
  )

  if (pkg.seed?.commitment) {
    checks.push(
      check('commitment', 'Seed commitment present', 'pass', `${pkg.seed.commitment.slice(0, 16)}…`),
    )
  } else {
    checks.push(check('commitment', 'Seed commitment present', 'fail', 'Missing commitment'))
  }

  if (pkg.seed?.revealed && pkg.seed?.seedHex) {
    const match = seedCommitment(Buffer.from(pkg.seed.seedHex, 'hex')) === pkg.seed.commitment
    checks.push(check('seedMatch', 'Revealed seed matches commitment', match ? 'pass' : 'fail'))
  } else {
    checks.push(check('seedMatch', 'Revealed seed matches commitment', 'skip', 'Seed not revealed yet'))
  }

  checks.push(replaySelections(pkg))
  checks.push(verifyTicketTransitions(pkg.entries || []))

  const stops = (pkg.entries || []).filter((e) => e.type === 'stop_reached')
  checks.push(check('stops', 'Automatic stopping points recorded', 'pass', `${stops.length} stop event(s)`))

  return { ok: checks.every((c) => c.status !== 'fail'), checks }
}

/** Parse RFC4180-ish CSV with optional `# key=value` metadata header lines. */
export function parseAuditCsv(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/)
  const meta = {}
  let i = 0
  while (i < lines.length && lines[i].trim().startsWith('#')) {
    const line = lines[i].trim().slice(1).trim()
    if (line === CSV_FORMAT || line.startsWith('draw-down-audit-csv')) {
      meta.format = line
    } else {
      const eq = line.indexOf('=')
      if (eq > 0) meta[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
    i += 1
  }
  while (i < lines.length && !lines[i].trim()) i += 1
  if (i >= lines.length) {
    return { ok: false, reason: 'CSV has no header row', meta, rows: [] }
  }

  const header = parseCsvLine(lines[i])
  i += 1
  const expected = [
    'seq',
    'at',
    'type',
    'selectionNumber',
    'ticket',
    'prevState',
    'nextState',
    'eligibleBefore',
    'eligibleAfter',
    'insuranceConsumed',
    'permanentlyEliminated',
    'stopAt',
    'hash',
  ]
  for (const col of expected) {
    if (!header.includes(col)) {
      return { ok: false, reason: `CSV missing column "${col}"`, meta, rows: [] }
    }
  }

  const rows = []
  for (; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue
    const cells = parseCsvLine(lines[i])
    const row = {}
    for (let c = 0; c < header.length; c += 1) row[header[c]] = cells[c] ?? ''
    rows.push(row)
  }
  return { ok: true, meta, rows, header }
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function csvCell(entry, key) {
  const v = entry[key]
  if (v == null || v === '') return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

function normBool(raw) {
  if (raw === '' || raw == null) return ''
  if (raw === true || raw === 'true' || raw === 'TRUE') return 'true'
  if (raw === false || raw === 'false' || raw === 'FALSE') return 'false'
  return String(raw)
}

/**
 * JSON is authoritative for crypto. CSV must match the JSON-derived entry view.
 * Metadata lines (when present) must also agree with the JSON package.
 */
export function crossCheckCsvAgainstJson(pkg, csvParsed) {
  const checks = []
  if (!csvParsed.ok) {
    return {
      ok: false,
      checks: [check('csvParse', 'Parse CSV export', 'fail', csvParsed.reason)],
    }
  }
  checks.push(check('csvParse', 'Parse CSV export', 'pass', `${csvParsed.rows.length} data row(s)`))

  const meta = csvParsed.meta || {}
  if (meta.eventId) {
    checks.push(
      check(
        'csvEventId',
        'CSV eventId matches JSON',
        meta.eventId === pkg.eventId ? 'pass' : 'fail',
        meta.eventId === pkg.eventId ? meta.eventId : `CSV ${meta.eventId} ≠ JSON ${pkg.eventId}`,
      ),
    )
  } else {
    checks.push(
      check(
        'csvEventId',
        'CSV eventId matches JSON',
        'skip',
        'Older CSV without metadata — JSON is authoritative; rows still cross-checked',
      ),
    )
  }

  if (meta.seedCommitment != null && meta.seedCommitment !== '') {
    const same = meta.seedCommitment === (pkg.seed?.commitment || '')
    checks.push(
      check(
        'csvSeedCommitment',
        'CSV seed commitment matches JSON',
        same ? 'pass' : 'fail',
        same ? undefined : 'Seed commitment differs — possible edit',
      ),
    )
  }

  if (meta.entryCount != null && meta.entryCount !== '') {
    const n = Number(meta.entryCount)
    const same = n === pkg.entries.length
    checks.push(
      check(
        'csvEntryCountMeta',
        'CSV entryCount metadata matches JSON',
        same ? 'pass' : 'fail',
        same ? String(n) : `CSV says ${meta.entryCount}, JSON has ${pkg.entries.length}`,
      ),
    )
  }

  if (csvParsed.rows.length !== pkg.entries.length) {
    checks.push(
      check(
        'csvRowCount',
        'CSV row count matches JSON entries',
        'fail',
        `CSV ${csvParsed.rows.length} row(s), JSON ${pkg.entries.length} entr(y/ies)`,
      ),
    )
  } else {
    checks.push(
      check('csvRowCount', 'CSV row count matches JSON entries', 'pass', String(pkg.entries.length)),
    )
  }

  const fields = [
    'seq',
    'at',
    'type',
    'selectionNumber',
    'ticket',
    'prevState',
    'nextState',
    'eligibleBefore',
    'eligibleAfter',
    'insuranceConsumed',
    'permanentlyEliminated',
    'stopAt',
    'hash',
  ]

  let mismatches = 0
  const samples = []
  const n = Math.min(csvParsed.rows.length, pkg.entries.length)
  for (let i = 0; i < n; i += 1) {
    const entry = pkg.entries[i]
    const row = csvParsed.rows[i]
    for (const field of fields) {
      let expected = csvCell(entry, field)
      let actual = row[field] ?? ''
      if (field === 'insuranceConsumed' || field === 'permanentlyEliminated') {
        expected = normBool(entry[field] == null ? '' : entry[field])
        actual = normBool(actual)
      }
      if (expected !== actual) {
        mismatches += 1
        if (samples.length < 8) {
          samples.push(`seq ${entry.seq} field ${field}: CSV="${actual}" JSON="${expected}"`)
        }
      }
    }
  }

  checks.push(
    check(
      'csvFields',
      'CSV fields match JSON entries',
      mismatches === 0 ? 'pass' : 'fail',
      mismatches === 0
        ? 'All compared fields agree'
        : `${mismatches} mismatch(es). ${samples.join('; ')}`,
    ),
  )

  return { ok: checks.every((c) => c.status !== 'fail'), checks }
}

export function verifyJsonAndCsv(pkg, csvText) {
  const jsonReport = verifyAuditPackage(pkg)
  const csvParsed = parseAuditCsv(csvText)
  const cross = crossCheckCsvAgainstJson(pkg, csvParsed)
  const checks = [...jsonReport.checks, ...cross.checks]
  const ok = checks.every((c) => c.status !== 'fail')
  return {
    ok,
    checks,
    summary: {
      eventId: pkg.eventId,
      eventName: pkg.eventName,
      startingTickets: pkg.startingTickets,
      entries: pkg.entries?.length ?? 0,
      jsonOk: jsonReport.ok,
      csvCrossOk: cross.ok,
    },
  }
}

/** Build CSV text matching app export (with metadata). */
export function auditPackageToCsv(pkg) {
  const meta = [
    `# ${CSV_FORMAT}`,
    `# eventId=${pkg.eventId}`,
    `# eventName=${String(pkg.eventName).replace(/\n/g, ' ')}`,
    `# startingTickets=${pkg.startingTickets}`,
    `# seedCommitment=${pkg.seed?.commitment || ''}`,
    `# seedRevealed=${pkg.seed?.revealed ? 'true' : 'false'}`,
    `# entryCount=${pkg.entries.length}`,
  ]
  const header = [
    'seq',
    'at',
    'type',
    'selectionNumber',
    'ticket',
    'prevState',
    'nextState',
    'eligibleBefore',
    'eligibleAfter',
    'insuranceConsumed',
    'permanentlyEliminated',
    'stopAt',
    'hash',
  ]
  const rows = pkg.entries.map((e) =>
    [
      e.seq,
      e.at,
      e.type,
      e.selectionNumber ?? '',
      e.ticket ?? '',
      e.prevState ?? '',
      e.nextState ?? '',
      e.eligibleBefore ?? '',
      e.eligibleAfter ?? '',
      e.insuranceConsumed ?? '',
      e.permanentlyEliminated ?? '',
      e.stopAt ?? '',
      e.hash,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  )
  return [...meta, header.join(','), ...rows].join('\n')
}
