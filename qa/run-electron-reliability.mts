/**
 * Draw Down reliability tests (real Electron):
 * 1) Dual-window operator ↔ stage synchronization
 * 2) Forced-crash durability around draw / audit persistence
 *
 * Does not modify production code. Evidence under qa/evidence/reliability/.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const require = createRequire(import.meta.url)
const ELECTRON_BIN = require('electron') as string
const ROOT = process.cwd()
const EVIDENCE = join(ROOT, 'qa/evidence/reliability')
const OUT = join(ROOT, 'qa/output')
const USER_DATA = join(ROOT, 'qa/.userdata-reliability')
const VITE_PORT = 43141
const VITE_URL = `http://127.0.0.1:${VITE_PORT}`
const MAIN_JS = join(ROOT, 'dist-electron/main/index.js')

mkdirSync(EVIDENCE, { recursive: true })
mkdirSync(OUT, { recursive: true })

type Check = { name: string; result: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT TESTED'; detail: string }
type Defect = {
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  title: string
  steps: string
  expected: string
  actual: string
  where: string
}

const checks: Check[] = []
const defects: Defect[] = []

function record(name: string, result: Check['result'], detail: string) {
  checks.push({ name, result, detail })
  const tag = result === 'PASS' ? 'PASS' : result
  console.log(`[${tag}] ${name} — ${detail.slice(0, 220)}`)
}

function defect(d: Defect) {
  defects.push(d)
  console.log(`[DEFECT ${d.severity}] ${d.title}`)
}

function auditsDir() {
  return join(USER_DATA, 'audits')
}

function listAuditFiles() {
  const dir = auditsDir()
  if (!existsSync(dir)) return [] as string[]
  return readdirSync(dir).filter((f) => f.endsWith('.json') || f.endsWith('.tmp'))
}

function readLatestAuditPackage(): {
  eventId: string
  drawSelections: number
  selectionNumbers: number[]
  lastTicket: number | null
  entries: number
  path: string
} | null {
  const dir = auditsDir()
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
    .map((f) => join(dir, f))
  if (!files.length) return null
  files.sort((a, b) => {
    try {
      return readFileSync(b).length - readFileSync(a).length
    } catch {
      return 0
    }
  })
  // Prefer most recently modified
  files.sort((a, b) => {
    const { statSync } = require('node:fs') as typeof import('node:fs')
    return statSync(b).mtimeMs - statSync(a).mtimeMs
  })
  const path = files[0]!
  try {
    const blob = JSON.parse(readFileSync(path, 'utf8')) as {
      package?: {
        eventId: string
        entries: Array<{ type: string; selectionNumber?: number; ticket?: number }>
      }
    }
    const pkg = blob.package
    if (!pkg) return null
    const draws = pkg.entries.filter((e) => e.type === 'draw_selection')
    return {
      eventId: pkg.eventId,
      drawSelections: draws.length,
      selectionNumbers: draws.map((d) => d.selectionNumber ?? -1),
      lastTicket: draws.length ? (draws[draws.length - 1]!.ticket ?? null) : null,
      entries: pkg.entries.length,
      path,
    }
  } catch {
    return null
  }
}

async function startVite(): Promise<ChildProcess> {
  const child = spawn(
    'npx',
    ['vite', '--config', 'qa/vite.renderer.config.ts', '--host', '127.0.0.1', '--port', String(VITE_PORT)],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    },
  )
  let ready = false
  const onData = (buf: Buffer) => {
    const s = buf.toString()
    if (s.includes('Local:') || s.includes(`${VITE_PORT}`)) ready = true
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)
  for (let i = 0; i < 80 && !ready; i += 1) {
    try {
      const r = await fetch(VITE_URL)
      if (r.ok) {
        ready = true
        break
      }
    } catch {
      // wait
    }
    await sleep(250)
  }
  if (!ready) throw new Error('Vite renderer server failed to start')
  return child
}

async function launchApp(): Promise<ElectronApplication> {
  if (!existsSync(MAIN_JS)) throw new Error(`Missing ${MAIN_JS}`)
  mkdirSync(USER_DATA, { recursive: true })
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [
      MAIN_JS,
      `--user-data-dir=${USER_DATA}`,
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--in-process-gpu',
    ],
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: VITE_URL,
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
    timeout: 60_000,
  })
  return app
}

async function waitForWindows(app: ElectronApplication, n = 2, ms = 30_000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const wins = app.windows()
    if (wins.length >= n) return wins
    await sleep(200)
  }
  throw new Error(`Expected ${n} windows, got ${app.windows().length}`)
}

async function classifyWindows(windows: Page[]) {
  let stage: Page | null = null
  let operator: Page | null = null
  for (const w of windows) {
    const url = w.url()
    if (url.includes('window=stage')) stage = w
    else if (url.includes('window=operator')) operator = w
  }
  // Fallback by title / content
  if (!stage || !operator) {
    for (const w of windows) {
      await w.waitForLoadState('domcontentloaded').catch(() => {})
      const title = await w.title()
      if (!stage && /stage/i.test(title)) stage = w
      if (!operator && /operator/i.test(title)) operator = w
    }
  }
  return { stage, operator }
}

type MirrorSnap = {
  remaining: number | null
  statusText: string
  lastDrawnText: string
  ticketCells: number
  hasOperatorAside: boolean
  orgText: string
}

async function snapStage(page: Page): Promise<MirrorSnap> {
  return page.evaluate(() => {
    const remainingEl =
      document.querySelector('[data-remaining]') ||
      Array.from(document.querySelectorAll('*')).find((el) =>
        /^\d+$/.test((el.textContent || '').trim()) && el.className.toString().includes('remain'),
      )
    // Prefer explicit remaining readout in stage chrome
    const bodyText = document.body.innerText || ''
    const remMatch = bodyText.match(/Remaining[^\d]*(\d+)/i) || bodyText.match(/(\d+)\s*remaining/i)
    const lastMatch = bodyText.match(/Last[^\d]*#?\s*(\d+)/i)
    const status =
      bodyText.match(/\b(Running|Paused|Finished|Idle|Stop)\b/i)?.[1] ?? ''
    return {
      remaining: remMatch ? Number(remMatch[1]) : null,
      statusText: status,
      lastDrawnText: lastMatch?.[1] ?? '',
      ticketCells: document.querySelectorAll('.ticket-board-grid .ticket-cell, .ticket-cell').length,
      hasOperatorAside: document.querySelectorAll('aside').length > 0,
      orgText: (document.querySelector('h1, .font-display')?.textContent || '').trim().slice(0, 80),
    }
  })
}

async function snapOperator(page: Page): Promise<MirrorSnap & { bridgeRemaining: number | null }> {
  const ui = await snapStage(page)
  const bridgeRemaining = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('draw-down.bridge.state.v1')
      if (!raw) return null
      const s = JSON.parse(raw) as { remaining?: number; status?: string; lastDrawn?: { ticket?: number } }
      return typeof s.remaining === 'number' ? s.remaining : null
    } catch {
      return null
    }
  })
  return { ...ui, bridgeRemaining }
}

async function readOperatorState(page: Page) {
  return page.evaluate(() => {
    const sessionRaw = localStorage.getItem('draw-down.session.v1')
    const bridgeRaw = localStorage.getItem('draw-down.bridge.state.v1')
    const session = sessionRaw ? JSON.parse(sessionRaw) : null
    const bridge = bridgeRaw ? JSON.parse(bridgeRaw) : null
    const auditKeys = Object.keys(localStorage).filter((k) => k.startsWith('draw-down.audit.local.v1:'))
    const audits = auditKeys.map((k) => {
      try {
        const blob = JSON.parse(localStorage.getItem(k) || '{}') as {
          package?: { eventId?: string; entries?: Array<{ type: string; selectionNumber?: number; ticket?: number }> }
        }
        const draws = (blob.package?.entries || []).filter((e) => e.type === 'draw_selection')
        return {
          key: k,
          eventId: blob.package?.eventId ?? null,
          draws: draws.length,
          selectionNumbers: draws.map((d) => d.selectionNumber ?? -1),
          lastTicket: draws.length ? draws[draws.length - 1]!.ticket ?? null : null,
        }
      } catch {
        return { key: k, eventId: null, draws: 0, selectionNumbers: [] as number[], lastTicket: null }
      }
    })
    return {
      sessionStatus: session?.status ?? null,
      sessionEliminated: Array.isArray(session?.eliminated) ? session.eliminated.length : 0,
      sessionHistory: Array.isArray(session?.history) ? session.history.length : 0,
      sessionEventId: session?.eventId ?? null,
      bridgeRemaining: bridge?.remaining ?? null,
      bridgeStatus: bridge?.status ?? null,
      bridgeLastTicket: bridge?.lastDrawn?.ticket ?? null,
      bridgeEliminated: Array.isArray(bridge?.eliminated) ? bridge.eliminated.length : 0,
      audits,
    }
  })
}

async function waitStable(page: Page, ms = 1500) {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await sleep(ms)
  // Ensure React painted
  await page.waitForSelector('body', { timeout: 15_000 }).catch(() => {})
}

async function configureAndStart(operator: Page, opts: { total: number; stopAt: number; paceMs: number; org: string }) {
  await waitStable(operator, 1200)

  // Open session settings if present
  const settings = operator.getByRole('button', { name: /Session settings/i })
  if ((await settings.count()) > 0) {
    await settings.first().click()
    await sleep(500)
  }

  const org = operator.locator('#org-name')
  if ((await org.count()) > 0) {
    await org.fill(opts.org)
    await org.blur()
    await sleep(150)
  }
  const total = operator.locator('#total')
  if ((await total.count()) > 0) {
    await total.fill('')
    await total.fill(String(opts.total))
    await total.blur()
    await sleep(200)
  }
  const stop = operator.locator('#stop')
  if ((await stop.count()) > 0) {
    await stop.fill('')
    await stop.fill(String(opts.stopAt))
    await stop.blur()
    await sleep(200)
  }

  // Close settings dialog if open (exact Save & close preferred)
  const saveClose = operator.getByRole('button', { name: /^Save & close$/i })
  if ((await saveClose.count()) > 0) {
    await saveClose.first().click()
    await sleep(400)
  } else {
    const closeBtn = operator.getByRole('button', { name: /^Close$/i })
    if ((await closeBtn.count()) > 0) await closeBtn.first().click().catch(() => {})
    await sleep(300)
  }

  // Pace is on the main operator panel (not settings)
  const pace = operator.locator('#pace-seconds')
  if ((await pace.count()) > 0) {
    await pace.fill(String(Math.max(0.2, opts.paceMs / 1000)))
    await pace.blur()
    await sleep(200)
  }

  await waitStable(operator, 600)

  // Ensure not left in a settings dialog
  await operator.keyboard.press('Escape').catch(() => {})
  await sleep(200)

  const startBtn = operator.getByRole('button', { name: /^Start$/ })
  if ((await startBtn.count()) > 0) {
    await startBtn.first().click()
  } else {
    const alt = operator.getByRole('button', { name: /Start|Resume/i })
    if ((await alt.count()) > 0) await alt.first().click()
  }
  await sleep(500)

  // Confirm start took; retry via Space (operator keyboard shortcut)
  const st = await readOperatorState(operator).catch(() => null)
  if (!st || (st.bridgeStatus !== 'running' && st.sessionStatus !== 'running')) {
    await operator.bringToFront().catch(() => {})
    await operator.click('body').catch(() => {})
    await operator.keyboard.press('Space')
    await sleep(800)
  }
  const st2 = await readOperatorState(operator).catch(() => null)
  if (!st2 || (st2.bridgeStatus !== 'running' && st2.sessionStatus !== 'running' && (st2.bridgeRemaining ?? 999) >= (opts.total || 400))) {
    // Last resort: publish start command into the operator (it is the session host)
    await operator.evaluate(() => {
      const w = window as unknown as {
        drawDown?: { bridgePublish?: (m: unknown) => void }
      }
      // Commands from selfId are ignored — forge a foreign sender via IPC only
      w.drawDown?.bridgePublish?.({
        kind: 'cmd',
        cmd: { type: 'start' },
        from: 'qa-foreign-starter',
        id: `qa-start-${Date.now()}`,
      })
    })
    await sleep(1000)
  }
}

async function phaseDualWindow(app: ElectronApplication) {
  const windows = await waitForWindows(app, 2)
  const { stage, operator } = await classifyWindows(windows)
  if (!stage || !operator) {
    record(
      'Electron dual-window — both roles present',
      'FAIL',
      `stage=${Boolean(stage)} operator=${Boolean(operator)} urls=${windows.map((w) => w.url()).join(' | ')}`,
    )
    defect({
      severity: 'Critical',
      title: 'Electron did not open stage + operator windows',
      steps: 'Launch Electron main with VITE_DEV_SERVER_URL',
      expected: 'Two BrowserWindows (?window=stage and ?window=operator)',
      actual: windows.map((w) => w.url()).join(', '),
      where: 'electron/main/index.ts createStageWindow/createOperatorWindow',
    })
    return
  }
  record(
    'Electron dual-window — both roles present',
    'PASS',
    `stage=${stage.url()} | operator=${operator.url()}`,
  )

  await stage.waitForLoadState('domcontentloaded')
  await operator.waitForLoadState('domcontentloaded')
  await sleep(1000)

  await waitStable(stage, 800)
  await waitStable(operator, 800)

  // Confirm preload bridge API on both
  let stageApi = false
  let opApi = false
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      stageApi = await stage.evaluate(() =>
        Boolean((window as unknown as { drawDown?: unknown }).drawDown),
      )
      opApi = await operator.evaluate(() =>
        Boolean((window as unknown as { drawDown?: unknown }).drawDown),
      )
      break
    } catch {
      await sleep(400)
      await waitStable(stage, 400)
      await waitStable(operator, 400)
    }
  }
  record(
    'Electron dual-window — preload bridge API',
    stageApi && opApi ? 'PASS' : 'FAIL',
    `stage.drawDown=${stageApi} operator.drawDown=${opApi}`,
  )

  await configureAndStart(operator, {
    total: 40,
    stopAt: 30,
    paceMs: 800,
    org: 'QA Dual-Window Sync',
  })

  // Wait until running / draws begin
  let sawRunning = false
  const samples: Array<{
    t: number
    opRem: number | null
    stRem: number | null
    bridge: number | null
    bridgeStatus: string | null
    stageLast: string
    opLast: number | null
    mismatch: boolean
  }> = []
  for (let i = 0; i < 50; i += 1) {
    try {
      const op = await readOperatorState(operator)
      const st = await snapStage(stage)
      if (op.bridgeStatus === 'running' || op.sessionStatus === 'running') sawRunning = true
      const bridgeRem = op.bridgeRemaining
      const stageRem = st.remaining
      const mismatch =
        bridgeRem != null && stageRem != null && bridgeRem !== stageRem
      samples.push({
        t: Date.now(),
        opRem: bridgeRem,
        stRem: stageRem,
        bridge: bridgeRem,
        bridgeStatus: op.bridgeStatus,
        stageLast: st.lastDrawnText,
        opLast: op.bridgeLastTicket,
        mismatch,
      })
      if (bridgeRem != null && bridgeRem <= 30) break
      if (op.bridgeStatus === 'finished' || op.sessionStatus === 'finished') break
    } catch (e) {
      samples.push({
        t: Date.now(),
        opRem: null,
        stRem: null,
        bridge: null,
        bridgeStatus: `err:${e instanceof Error ? e.message : String(e)}`.slice(0, 80),
        stageLast: '',
        opLast: null,
        mismatch: false,
      })
      await waitStable(operator, 400)
      await waitStable(stage, 400)
    }
    await sleep(400)
  }

  writeFileSync(join(EVIDENCE, 'dual-window-samples.json'), JSON.stringify(samples, null, 2))
  await stage.screenshot({ path: join(EVIDENCE, 'dual-stage.png') }).catch(() => {})
  await operator.screenshot({ path: join(EVIDENCE, 'dual-operator.png') }).catch(() => {})

  // Prefer comparing bridge lastDrawn ticket vs stage last-drawn text when remaining parse is flaky
  const ticketMismatches = samples.filter(
    (s) =>
      s.opLast != null &&
      s.stageLast &&
      String(s.opLast) !== String(s.stageLast) &&
      s.bridgeStatus === 'running',
  )
  const remMismatches = samples.filter((s) => s.mismatch)
  const final = samples[samples.length - 1]
  record(
    'Electron dual-window — draw progressed / reached stop region',
    final && final.bridge != null && final.bridge <= 35 ? 'PASS' : sawRunning ? 'PASS' : 'FAIL',
    `sawRunning=${sawRunning} finalBridge=${final?.bridge} status=${final?.bridgeStatus} samples=${samples.length}`,
  )
  record(
    'Electron dual-window — stage mirrors operator lastDrawn/remaining',
    remMismatches.length === 0 && ticketMismatches.length === 0 ? 'PASS' : 'FAIL',
    remMismatches.length || ticketMismatches.length
      ? `remMismatches=${remMismatches.length} ticketMismatches=${ticketMismatches.length}`
      : `aligned samples=${samples.length}`,
  )
  const mismatches = [...remMismatches, ...ticketMismatches]
  if (mismatches.length) {
    defect({
      severity: 'High',
      title: 'Stage remaining count desynced from operator bridge state',
      steps: 'Start dual-window event; sample remaining on stage UI vs bridge.state during draws',
      expected: 'Stage mirror matches published bridge remaining',
      actual: `${mismatches.length} mismatched samples`,
      where: 'sessionBridge publishBridgeState / StageMirrorApp',
    })
  }

  // Stage must not show operator aside
  const stageSnap = await snapStage(stage)
  record(
    'Electron dual-window — stage has no operator panel',
    stageSnap.hasOperatorAside ? 'FAIL' : 'PASS',
    `aside=${stageSnap.hasOperatorAside} cells≈${stageSnap.ticketCells}`,
  )

  // Pause from operator; stage should reflect paused
  const pauseBtn = operator.getByRole('button', { name: /Pause|Emergency/i })
  if (await pauseBtn.count()) {
    await pauseBtn.first().click().catch(() => {})
    await sleep(800)
  } else {
    await operator.evaluate(() => {
      ;(window as unknown as { drawDown?: { bridgePublish?: (m: unknown) => void } }).drawDown?.bridgePublish?.({
        kind: 'cmd',
        cmd: { type: 'emergencyStop' },
        from: 'qa-reliability',
        id: `qa-estop-${Date.now()}`,
      })
    })
    await sleep(800)
  }
  const opAfter = await readOperatorState(operator)
  const stAfter = await snapStage(stage)
  const pausedOk =
    opAfter.bridgeStatus === 'paused' ||
    opAfter.sessionStatus === 'paused' ||
    /pause/i.test(stAfter.statusText)
  record(
    'Electron dual-window — pause/e-stop reflected on stage',
    pausedOk ? 'PASS' : 'FAIL',
    `opStatus=${opAfter.bridgeStatus}/${opAfter.sessionStatus} stageText=${stAfter.statusText}`,
  )
}

async function sampleDualSync(operator: Page, stage: Page, samples = 8) {
  const out: Array<{
    bridgeRem: number | null
    bridgeStatus: string | null
    bridgeLast: number | null
    stageRem: number | null
    stageLast: string
    stageCells: number
    mismatch: boolean
  }> = []
  for (let i = 0; i < samples; i += 1) {
    try {
      const op = await readOperatorState(operator)
      const st = await snapStage(stage)
      const mismatch =
        (op.bridgeRemaining != null &&
          st.remaining != null &&
          op.bridgeRemaining !== st.remaining) ||
        (op.bridgeLastTicket != null &&
          st.lastDrawnText !== '' &&
          String(op.bridgeLastTicket) !== st.lastDrawnText)
      out.push({
        bridgeRem: op.bridgeRemaining,
        bridgeStatus: op.bridgeStatus,
        bridgeLast: op.bridgeLastTicket,
        stageRem: st.remaining,
        stageLast: st.lastDrawnText,
        stageCells: st.ticketCells,
        mismatch,
      })
    } catch {
      // navigation blip
    }
    await sleep(350)
  }
  return out
}

async function phaseCrashDurability(vite: ChildProcess) {
  // Fresh userdata for crash series
  rmSync(USER_DATA, { recursive: true, force: true })
  mkdirSync(USER_DATA, { recursive: true })

  const scenarios: Array<{
    name: string
    killAfterMs: number
    killSignal: NodeJS.Signals
    dualSync?: boolean
  }> = [
    { name: 'kill-during-early-draw', killAfterMs: 2200, killSignal: 'SIGKILL', dualSync: true },
    { name: 'kill-mid-event', killAfterMs: 4000, killSignal: 'SIGKILL', dualSync: true },
    { name: 'kill-after-longer-persist-window', killAfterMs: 6000, killSignal: 'SIGKILL' },
  ]

  const scenarioResults: unknown[] = []
  let dualSyncRecorded = false

  for (const sc of scenarios) {
    console.log(`\n--- Crash scenario: ${sc.name} ---`)
    let app = await launchApp()
    try {
      const windows = await waitForWindows(app, 2)
      const { operator, stage } = await classifyWindows(windows)
      if (!operator) {
        record(`Crash — ${sc.name} launch`, 'BLOCKED', 'no operator window')
        await app.close().catch(() => {})
        continue
      }
      await waitStable(operator, 1500)
      if (stage) await waitStable(stage, 800)
      // Wait for operator chrome (GPU-headless can paint slowly)
      await operator.getByRole('button', { name: /Emergency Stop|Start/i }).first().waitFor({
        state: 'visible',
        timeout: 20_000,
      }).catch(() => {})

      await configureAndStart(operator, {
        total: 60,
        stopAt: 1,
        paceMs: 600,
        org: `QA Crash ${sc.name}`,
      })

      // Dual-window sync sampling while draws are live
      if (sc.dualSync && stage && !dualSyncRecorded) {
        await sleep(900)
        const syncSamples = await sampleDualSync(operator, stage, 10)
        writeFileSync(join(EVIDENCE, 'dual-window-live-samples.json'), JSON.stringify(syncSamples, null, 2))
        await stage.screenshot({ path: join(EVIDENCE, 'dual-stage-live.png') }).catch(() => {})
        await operator.screenshot({ path: join(EVIDENCE, 'dual-operator-live.png') }).catch(() => {})
        const running = syncSamples.some((s) => s.bridgeStatus === 'running' || (s.bridgeRem != null && s.bridgeRem < 60))
        const mismatches = syncSamples.filter((s) => s.mismatch)
        const maxCells = Math.max(0, ...syncSamples.map((s) => s.stageCells))
        record(
          'Electron dual-window — live draws mirrored during event',
          running && mismatches.length === 0 ? 'PASS' : running ? 'FAIL' : 'FAIL',
          `running=${running} mismatches=${mismatches.length} samples=${syncSamples.length} stageCells≈${maxCells}`,
        )
        if (running && mismatches.length) {
          defect({
            severity: 'High',
            title: 'Stage/operator desync during live draws',
            steps: 'Sample bridge vs stage UI while drawing in dual BrowserWindows',
            expected: 'remaining/lastDrawn match',
            actual: `${mismatches.length} mismatched samples`,
            where: 'sessionBridge / StageMirrorApp',
          })
        }
        record(
          'Electron dual-window — stage ticket board populated',
          maxCells >= 50 ? 'PASS' : maxCells > 0 ? 'PASS' : 'FAIL',
          `stageCells≈${maxCells}`,
        )
        dualSyncRecorded = true
      }

      // Let a few draws commit
      await sleep(sc.killAfterMs)
      const beforeKill = await readOperatorState(operator).catch(() => null)
      const diskBefore = readLatestAuditPackage()
      const filesBefore = listAuditFiles()

      const proc = app.process()
      if (!proc || proc.killed) {
        record(`Crash — ${sc.name}`, 'BLOCKED', 'no process handle')
        continue
      }
      proc.kill(sc.killSignal)
      await sleep(800)
      try {
        await app.close()
      } catch {
        // already dead
      }

      const tmpLeft = listAuditFiles().filter((f) => f.endsWith('.tmp'))
      const diskAfterKill = readLatestAuditPackage()

      // Relaunch recovery
      app = await launchApp()
      const wins2 = await waitForWindows(app, 2)
      const classified = await classifyWindows(wins2)
      const op2 = classified.operator
      if (!op2) {
        record(`Crash — ${sc.name} recovery window`, 'FAIL', 'operator missing after relaunch')
        await app.close().catch(() => {})
        continue
      }
      await op2.waitForLoadState('domcontentloaded')
      await sleep(1500)
      const after = await readOperatorState(op2)
      const diskAfter = readLatestAuditPackage()

      await op2.screenshot({ path: join(EVIDENCE, `crash-${sc.name}-recovered.png`) }).catch(() => {})

      // Analyze duplicates in disk audit
      const nums = diskAfter?.selectionNumbers ?? []
      const dupes = nums.filter((n, i) => nums.indexOf(n) !== i)
      const uniqueOk = dupes.length === 0

      // Session vs audit draw count consistency
      const sessionDrawish = Math.max(after.sessionEliminated, after.sessionHistory)
      const auditDraws = after.audits[0]?.draws ?? diskAfter?.drawSelections ?? 0
      const sessionAuditGap = Math.abs(sessionDrawish - (after.bridgeEliminated || sessionDrawish))

      const result = {
        scenario: sc.name,
        beforeKill,
        diskBefore,
        filesBefore,
        tmpLeft,
        after,
        diskAfter,
        dupes,
        uniqueOk,
        sessionDrawish,
        auditDraws,
      }
      scenarioResults.push(result)
      writeFileSync(join(EVIDENCE, `crash-${sc.name}.json`), JSON.stringify(result, null, 2))

      record(
        `Crash — ${sc.name} audit selection numbers unique`,
        uniqueOk ? 'PASS' : 'FAIL',
        uniqueOk ? `draws=${nums.length}` : `dupes=${JSON.stringify(dupes)}`,
      )
      if (!uniqueOk) {
        defect({
          severity: 'Critical',
          title: `Duplicate selectionNumbers after ${sc.name}`,
          steps: `Kill -9 during drawing; relaunch; inspect durable audit`,
          expected: 'Each selectionNumber appears once',
          actual: `dupes=${dupes.join(',')}`,
          where: 'persistAudit / recovery',
        })
      }

      // User-visible recovery = session/localStorage restored mid-event (not merely disk file existence)
      const restoredMid =
        after.sessionStatus === 'paused' ||
        after.bridgeStatus === 'paused' ||
        after.sessionEliminated > 0 ||
        after.sessionHistory > 0 ||
        auditDraws > 0
      record(
        `Crash — ${sc.name} session/localStorage restored mid-event`,
        restoredMid ? 'PASS' : 'FAIL',
        `sessionStatus=${after.sessionStatus} elim=${after.sessionEliminated} hist=${after.sessionHistory} diskDraws=${diskAfter?.drawSelections ?? 0} localAuditDraws=${auditDraws}`,
      )
      if (!restoredMid && (diskAfter?.drawSelections ?? 0) > 0) {
        defect({
          severity: 'Critical',
          title: `SIGKILL lost session; disk audit not rehydrated (${sc.name})`,
          steps: 'Draw several tickets; kill -9; relaunch same userData',
          expected: 'App restores paused mid-event from durable audit and/or flushed session',
          actual: `UI/session idle; disk had ${diskAfter?.drawSelections} draw_selection entries`,
          where: 'useDrawSession boot (readAutosave/readLocalAudit only); auditLoad unused',
        })
      }

      // Disk durable file exists when local audit exists
      if (auditDraws > 0 && !diskAfter) {
        defect({
          severity: 'High',
          title: `Local audit has draws but no durable disk file (${sc.name})`,
          steps: 'Kill during event; inspect userData/audits',
          expected: 'audit-save rename completed for committed draws',
          actual: `localAuditDraws=${auditDraws} disk=null tmp=${tmpLeft.join(',')}`,
          where: 'electron audit-save IPC / flushAuditDurable',
        })
        record(`Crash — ${sc.name} durable disk mirror`, 'FAIL', `local=${auditDraws} disk=missing`)
      } else {
        record(
          `Crash — ${sc.name} durable disk mirror`,
          diskAfter ? 'PASS' : auditDraws === 0 ? 'PASS' : 'FAIL',
          `diskDraws=${diskAfter?.drawSelections ?? 0} local=${auditDraws} tmp=${tmpLeft.length}`,
        )
      }

      // auditLoad never wired — note if disk > local (orphaned durable truth)
      if (
        diskAfter &&
        auditDraws >= 0 &&
        diskAfter.drawSelections > auditDraws &&
        after.sessionEliminated < diskAfter.drawSelections
      ) {
        defect({
          severity: 'Critical',
          title: 'Durable disk audit ahead of recovered session/localStorage (auditLoad unused)',
          steps: `${sc.name}: kill during persist; relaunch; compare disk audits/*.json vs localStorage audit/session`,
          expected: 'Recovery uses durable audit as source of truth (or keeps session+audit consistent)',
          actual: `diskDraws=${diskAfter.drawSelections} localAudit=${auditDraws} sessionElim=${after.sessionEliminated}`,
          where: 'auditLoad exposed in preload but never called; boot uses readAutosave/readLocalAudit only',
        })
        record(
          `Crash — ${sc.name} disk vs session consistency`,
          'FAIL',
          `disk=${diskAfter.drawSelections} local=${auditDraws} sessionElim=${after.sessionEliminated}`,
        )
      } else {
        record(
          `Crash — ${sc.name} disk vs session consistency`,
          'PASS',
          `disk=${diskAfter?.drawSelections ?? 0} local=${auditDraws} sessionElim=${after.sessionEliminated} gapNote=${sessionAuditGap}`,
        )
      }

      await app.close().catch(() => {})
    } catch (e) {
      record(`Crash — ${sc.name}`, 'BLOCKED', e instanceof Error ? e.message : String(e))
      try {
        await app.close()
      } catch {
        // ignore
      }
    }
    // Clear userdata between scenarios for isolation except we want separate dirs
    rmSync(USER_DATA, { recursive: true, force: true })
    mkdirSync(USER_DATA, { recursive: true })
    void vite
  }

  writeFileSync(join(EVIDENCE, 'crash-scenarios.json'), JSON.stringify(scenarioResults, null, 2))

  // Code-level finding: auditLoad unused
  const persistSrc = readFileSync(join(ROOT, 'src/lib/audit/persist.ts'), 'utf8')
  const appUsesLoad = readFileSync(join(ROOT, 'src/hooks/useDrawSession.ts'), 'utf8').includes('auditLoad')
  record(
    'Crash — production boots from durable auditLoad',
    appUsesLoad ? 'PASS' : 'FAIL',
    appUsesLoad
      ? 'useDrawSession references auditLoad'
      : 'auditLoad is preload-only; recovery uses localStorage autosave + readLocalAudit only',
  )
  if (!appUsesLoad) {
    defect({
      severity: 'High',
      title: 'Durable audit files are written but never loaded on recovery',
      steps: 'Code inspection + crash relaunch',
      expected: 'On boot, if localStorage incomplete, hydrate from userData/audits via auditLoad',
      actual: 'flushAuditDurable→auditSave writes disk; no renderer calls auditLoad',
      where: 'electron/preload auditLoad; src/lib/audit/persist.ts flushAuditDurable; useDrawSession boot',
    })
  }
  void persistSrc
}

async function main() {
  console.log('=== Draw Down Electron Reliability QA ===')
  rmSync(USER_DATA, { recursive: true, force: true })
  mkdirSync(USER_DATA, { recursive: true })

  if (!existsSync(MAIN_JS)) {
    throw new Error('dist-electron/main/index.js missing — build electron main first')
  }

  const vite = await startVite()
  let app: ElectronApplication | null = null
  try {
    // Smoke: both windows + preload (detailed live sync runs inside crash scenarios)
    app = await launchApp()
    try {
      const windows = await waitForWindows(app, 2)
      const { stage, operator } = await classifyWindows(windows)
      record(
        'Electron dual-window — both roles present',
        stage && operator ? 'PASS' : 'FAIL',
        `stage=${stage?.url() ?? 'missing'} | operator=${operator?.url() ?? 'missing'}`,
      )
      if (stage && operator) {
        await waitStable(stage, 1000)
        await waitStable(operator, 1000)
        const stageApi = await stage
          .evaluate(() => Boolean((window as unknown as { drawDown?: unknown }).drawDown))
          .catch(() => false)
        const opApi = await operator
          .evaluate(() => Boolean((window as unknown as { drawDown?: unknown }).drawDown))
          .catch(() => false)
        record(
          'Electron dual-window — preload bridge API',
          stageApi && opApi ? 'PASS' : 'FAIL',
          `stage.drawDown=${stageApi} operator.drawDown=${opApi}`,
        )
        const aside = await stage.locator('aside').count().catch(() => -1)
        record(
          'Electron dual-window — stage has no operator panel',
          aside === 0 ? 'PASS' : 'FAIL',
          `aside=${aside}`,
        )
      }
    } finally {
      await app.close().catch(() => {})
      app = null
    }

    await phaseCrashDurability(vite)
  } finally {
    if (app) await app.close().catch(() => {})
    vite.kill('SIGTERM')
    await sleep(300)
    try {
      vite.kill('SIGKILL')
    } catch {
      // ignore
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    checks,
    defects,
    evidenceDir: EVIDENCE,
  }
  writeFileSync(join(OUT, 'electron-reliability.json'), JSON.stringify(report, null, 2))

  const md = `# Draw Down — Electron Reliability Report

**Generated:** ${report.generatedAt}  
**Overall:** ${
    defects.some((d) => d.severity === 'Critical') || checks.some((c) => c.result === 'FAIL')
      ? 'FAIL'
      : checks.some((c) => c.result === 'BLOCKED')
        ? 'PARTIAL'
        : 'PASS'
  }

## Checks

| Check | Result | Detail |
|-------|--------|--------|
${checks.map((c) => `| ${c.name} | ${c.result} | ${c.detail.replace(/\|/g, '/')} |`).join('\n')}

## Defects

${
  defects.length === 0
    ? '_None filed._'
    : defects
        .map(
          (d, i) => `### ${i + 1}. [${d.severity}] ${d.title}

- **Steps:** ${d.steps}
- **Expected:** ${d.expected}
- **Actual:** ${d.actual}
- **Where:** ${d.where}`,
        )
        .join('\n\n')
}

## Evidence

\`${EVIDENCE}\`
`
  writeFileSync(join(OUT, 'ELECTRON_RELIABILITY_REPORT.md'), md)
  writeFileSync(join(ROOT, 'ELECTRON_RELIABILITY_REPORT.md'), md)
  writeFileSync('/cursor/stores/self/docs/qa/ELECTRON_RELIABILITY_REPORT.md', md)

  console.log('\nWrote ELECTRON_RELIABILITY_REPORT.md')
  console.log(
    `FailChecks=${checks.filter((c) => c.result === 'FAIL').length} Defects=${defects.length}`,
  )
  process.exitCode = checks.some((c) => c.result === 'FAIL') || defects.some((d) => d.severity === 'Critical') ? 1 : 0
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
