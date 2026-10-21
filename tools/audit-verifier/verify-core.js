/**
 * Browser offline audit verify core (Web Crypto SHA-256).
 * Same checks as scripts/lib/audit-verify-core.mjs — no private keys.
 */
;(() => {
  const GENESIS = '0'.repeat(64)
  const DOMAIN = new TextEncoder().encode('draw-down-rng-v1')
  const CSV_FORMAT = 'draw-down-audit-csv-v1'

  async function sha256Hex(input) {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
    const dig = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('')
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

  async function hashEntry(body) {
    return sha256Hex(JSON.stringify(canonicalize(body)))
  }

  function counterBytes(counter) {
    const buf = new ArrayBuffer(8)
    const view = new DataView(buf)
    view.setUint32(0, Math.floor(counter / 2 ** 32))
    view.setUint32(4, counter >>> 0)
    return new Uint8Array(buf)
  }

  async function rngBlock(seed, counter) {
    const c = counterBytes(counter)
    const buf = new Uint8Array(seed.length + c.length + DOMAIN.length)
    buf.set(seed, 0)
    buf.set(c, seed.length)
    buf.set(DOMAIN, seed.length + c.length)
    const dig = await crypto.subtle.digest('SHA-256', buf)
    return new Uint8Array(dig)
  }

  async function seedCommitment(seed) {
    return sha256Hex(seed)
  }

  function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    return out
  }

  async function unbiasedIndex(seed, startCounter, n) {
    if (n === 1) return { index: 0, counterAfter: startCounter }
    const limit = Math.floor(0x100000000 / n) * n
    let counter = startCounter
    for (let guard = 0; guard < 10000; guard += 1) {
      const block = await rngBlock(seed, counter)
      counter += 1
      const value = ((block[0] << 24) | (block[1] << 16) | (block[2] << 8) | block[3]) >>> 0
      if (value < limit) return { index: value % n, counterAfter: counter }
    }
    throw new Error('rejection sampling failed')
  }

  function check(id, label, status, detail) {
    return { id, label, status, detail }
  }

  async function verifyHashChain(entries) {
    let prev = GENESIS
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]
      if (entry.seq !== i + 1) {
        return { ok: false, reason: `Unexpected seq at index ${i}` }
      }
      if (entry.prevHash !== prev) {
        return { ok: false, reason: `prevHash mismatch at seq ${entry.seq}` }
      }
      const { hash, ...body } = entry
      const expected = await hashEntry(body)
      if (hash !== expected) {
        return { ok: false, reason: `Hash mismatch at seq ${entry.seq} (entry was altered)` }
      }
      prev = hash
    }
    return { ok: true, checked: entries.length }
  }

  async function replaySelections(pkg) {
    if (!pkg.seed?.revealed || !pkg.seed?.seedHex) {
      return check('replay', 'Reproduce selections from seed', 'skip', 'Seed not revealed')
    }
    const seed = hexToBytes(pkg.seed.seedHex)
    if ((await seedCommitment(seed)) !== pkg.seed.commitment) {
      return check('replay', 'Reproduce selections from seed', 'fail', 'Revealed seed does not match commitment')
    }
    let counter = 0
    const draws = pkg.entries.filter((e) => e.type === 'draw_selection')
    for (const entry of draws) {
      const rng = entry.rng
      if (!rng?.eligibleSorted?.length) {
        return check('replay', 'Reproduce selections from seed', 'fail', `Missing RNG at seq ${entry.seq}`)
      }
      const pick = await unbiasedIndex(seed, counter, rng.eligibleSorted.length)
      counter = pick.counterAfter
      const ticket = rng.eligibleSorted[pick.index]
      if (ticket !== entry.ticket || pick.index !== rng.index) {
        return check(
          'replay',
          'Reproduce selections from seed',
          'fail',
          `Mismatch at selection #${entry.selectionNumber}`,
        )
      }
    }
    return check('replay', 'Reproduce selections from seed', 'pass', `Reproduced ${draws.length} selection(s)`)
  }

  function verifyTicketTransitions(entries) {
    const eliminated = new Set()
    const held = new Set()
    for (const e of entries) {
      if (e.type === 'hold' && e.ticket != null) {
        if (eliminated.has(e.ticket)) {
          return check('transitions', 'Ticket state transitions', 'fail', `Hold of eliminated #${e.ticket}`)
        }
        held.add(e.ticket)
      }
      if (e.type === 'release' && e.ticket != null) held.delete(e.ticket)
      if (e.type === 'draw_selection' && e.ticket != null) {
        if (eliminated.has(e.ticket)) {
          return check('transitions', 'Ticket state transitions', 'fail', `Re-select eliminated #${e.ticket}`)
        }
        if (held.has(e.ticket)) {
          return check('transitions', 'Ticket state transitions', 'fail', `Select held #${e.ticket}`)
        }
        if (e.permanentlyEliminated) eliminated.add(e.ticket)
      }
    }
    return check('transitions', 'Ticket state transitions', 'pass')
  }

  async function verifyAuditPackage(pkg) {
    const checks = []
    checks.push(
      check('format', 'Package format', pkg.format === 'draw-down-audit-v1' ? 'pass' : 'fail', pkg.format),
    )
    const chain = await verifyHashChain(pkg.entries || [])
    checks.push(
      check('chain', 'Tamper-evident hash chain', chain.ok ? 'pass' : 'fail', chain.ok ? `${chain.checked} entries` : chain.reason),
    )
    if (pkg.seed?.commitment) {
      checks.push(check('commitment', 'Seed commitment present', 'pass', pkg.seed.commitment.slice(0, 16) + '…'))
    } else {
      checks.push(check('commitment', 'Seed commitment present', 'fail', 'Missing'))
    }
    if (pkg.seed?.revealed && pkg.seed?.seedHex) {
      const match = (await seedCommitment(hexToBytes(pkg.seed.seedHex))) === pkg.seed.commitment
      checks.push(check('seedMatch', 'Revealed seed matches commitment', match ? 'pass' : 'fail'))
    } else {
      checks.push(check('seedMatch', 'Revealed seed matches commitment', 'skip', 'Seed not revealed yet'))
    }
    checks.push(await replaySelections(pkg))
    checks.push(verifyTicketTransitions(pkg.entries || []))
    const stops = (pkg.entries || []).filter((e) => e.type === 'stop_reached')
    checks.push(check('stops', 'Automatic stopping points recorded', 'pass', `${stops.length} stop(s)`))
    return { ok: checks.every((c) => c.status !== 'fail'), checks }
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
      } else if (ch === '"') inQuotes = true
      else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out
  }

  function parseAuditCsv(text) {
    const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/)
    const meta = {}
    let i = 0
    while (i < lines.length && lines[i].trim().startsWith('#')) {
      const line = lines[i].trim().slice(1).trim()
      if (line.startsWith('draw-down-audit-csv')) meta.format = line
      else {
        const eq = line.indexOf('=')
        if (eq > 0) meta[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
      }
      i += 1
    }
    while (i < lines.length && !lines[i].trim()) i += 1
    if (i >= lines.length) return { ok: false, reason: 'CSV has no header', meta, rows: [] }
    const header = parseCsvLine(lines[i])
    i += 1
    const need = [
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
    for (const col of need) {
      if (!header.includes(col)) return { ok: false, reason: `Missing column ${col}`, meta, rows: [] }
    }
    const rows = []
    for (; i < lines.length; i += 1) {
      if (!lines[i].trim()) continue
      const cells = parseCsvLine(lines[i])
      const row = {}
      for (let c = 0; c < header.length; c += 1) row[header[c]] = cells[c] ?? ''
      rows.push(row)
    }
    return { ok: true, meta, rows }
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

  function crossCheckCsvAgainstJson(pkg, csvParsed) {
    const checks = []
    if (!csvParsed.ok) {
      return { ok: false, checks: [check('csvParse', 'Parse CSV export', 'fail', csvParsed.reason)] }
    }
    checks.push(check('csvParse', 'Parse CSV export', 'pass', `${csvParsed.rows.length} row(s)`))
    const meta = csvParsed.meta || {}
    if (meta.eventId) {
      checks.push(
        check(
          'csvEventId',
          'CSV eventId matches JSON',
          meta.eventId === pkg.eventId ? 'pass' : 'fail',
          meta.eventId === pkg.eventId ? meta.eventId : `${meta.eventId} ≠ ${pkg.eventId}`,
        ),
      )
    } else {
      checks.push(
        check(
          'csvEventId',
          'CSV eventId matches JSON',
          'skip',
          'Older CSV without metadata — JSON authoritative; rows still checked',
        ),
      )
    }
    if (meta.seedCommitment) {
      const same = meta.seedCommitment === (pkg.seed?.commitment || '')
      checks.push(check('csvSeedCommitment', 'CSV seed commitment matches JSON', same ? 'pass' : 'fail'))
    }
    if (csvParsed.rows.length !== pkg.entries.length) {
      checks.push(
        check(
          'csvRowCount',
          'CSV row count matches JSON entries',
          'fail',
          `CSV ${csvParsed.rows.length} vs JSON ${pkg.entries.length}`,
        ),
      )
    } else {
      checks.push(check('csvRowCount', 'CSV row count matches JSON entries', 'pass', String(pkg.entries.length)))
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
          if (samples.length < 8) samples.push(`seq ${entry.seq} ${field}: CSV="${actual}" JSON="${expected}"`)
        }
      }
    }
    checks.push(
      check(
        'csvFields',
        'CSV fields match JSON entries',
        mismatches === 0 ? 'pass' : 'fail',
        mismatches === 0 ? 'All compared fields agree' : `${mismatches} mismatch(es). ${samples.join('; ')}`,
      ),
    )
    return { ok: checks.every((c) => c.status !== 'fail'), checks }
  }

  async function verifyJsonAndCsv(pkg, csvText) {
    const jsonReport = await verifyAuditPackage(pkg)
    const csvParsed = parseAuditCsv(csvText)
    const cross = crossCheckCsvAgainstJson(pkg, csvParsed)
    const checks = [...jsonReport.checks, ...cross.checks]
    return {
      ok: checks.every((c) => c.status !== 'fail'),
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

  window.DrawDownAuditVerify = {
    CSV_FORMAT,
    parseAuditCsv,
    verifyAuditPackage,
    verifyJsonAndCsv,
  }
})()
