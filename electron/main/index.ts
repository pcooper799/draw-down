import { app, BrowserWindow, ipcMain, Menu, screen, shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (process.platform === 'win32' && os.release().startsWith('6.1')) {
  app.disableHardwareAcceleration()
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.drawdown.app')
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let stageWin: BrowserWindow | null = null
let operatorWin: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

function resolveAppIcon() {
  const buildIco = path.join(process.env.APP_ROOT!, 'build', 'icon.ico')
  const publicIco = path.join(process.env.VITE_PUBLIC!, 'favicon.ico')
  return process.platform === 'win32' ? buildIco : publicIco
}

/** NSIS uninstaller next to the installed executable (Windows installer builds only). */
function findUninstaller(): string | null {
  if (process.platform !== 'win32' || !app.isPackaged) return null
  const installDir = path.dirname(process.execPath)
  const candidates = [
    path.join(installDir, 'Uninstall Draw Down.exe'),
    path.join(installDir, `Uninstall ${app.getName()}.exe`),
    path.join(installDir, 'uninstall.exe'),
  ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // ignore
    }
  }
  return null
}

function getInstallInfo() {
  const uninstaller = findUninstaller()
  return {
    packaged: app.isPackaged,
    platform: process.platform as NodeJS.Platform,
    canUninstall: Boolean(uninstaller),
    installDir: app.isPackaged ? path.dirname(process.execPath) : null,
  }
}

async function launchUninstaller(): Promise<{ ok: boolean; reason?: string }> {
  const uninstaller = findUninstaller()
  if (!uninstaller) {
    return {
      ok: false,
      reason: app.isPackaged
        ? 'Uninstaller not found. Use Windows Settings → Apps to remove Draw Down, or delete the portable folder.'
        : 'Uninstall is available in the installed Windows app (NSIS installer), not in portable/dev mode.',
    }
  }

  try {
    const child = spawn(uninstaller, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.unref()
    setTimeout(() => {
      app.quit()
    }, 400)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Could not start uninstaller',
    }
  }
}

async function loadRole(win: BrowserWindow, role: 'stage' | 'operator') {
  if (VITE_DEV_SERVER_URL) {
    const base = VITE_DEV_SERVER_URL.replace(/\/$/, '')
    await win.loadURL(`${base}/?window=${role}`)
  } else {
    await win.loadFile(indexHtml, { query: { window: role } })
  }
}

function wireExternalLinks(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

function broadcastBridge(message: unknown, except?: Electron.WebContents) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    if (except && win.webContents.id === except.id) continue
    win.webContents.send('draw-down:bridge', message)
  }
}

async function createStageWindow() {
  const primary = screen.getPrimaryDisplay().workArea
  stageWin = new BrowserWindow({
    title: 'Draw Down — Stage',
    x: primary.x + 40,
    y: primary.y + 40,
    width: Math.min(1400, primary.width - 80),
    height: Math.min(900, primary.height - 80),
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b1210',
    show: false,
    icon: resolveAppIcon(),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      // Stage may stay full-screen while operator is minimized; keep UI responsive.
      backgroundThrottling: false,
    },
  })

  stageWin.once('ready-to-show', () => stageWin?.show())
  stageWin.on('closed', () => {
    stageWin = null
    // Closing the stage ends the event app.
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.close()
    }
  })

  wireExternalLinks(stageWin)
  await loadRole(stageWin, 'stage')
}

async function createOperatorWindow() {
  if (operatorWin && !operatorWin.isDestroyed()) {
    if (operatorWin.isMinimized()) operatorWin.restore()
    operatorWin.show()
    operatorWin.focus()
    return operatorWin
  }

  const primary = screen.getPrimaryDisplay().workArea
  const width = 440
  operatorWin = new BrowserWindow({
    title: 'Draw Down — Operator',
    x: primary.x + Math.max(40, primary.width - width - 40),
    y: primary.y + 60,
    width,
    height: Math.min(960, primary.height - 80),
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#101816',
    show: false,
    alwaysOnTop: true,
    icon: resolveAppIcon(),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      // Draw timer runs in this window — must keep firing when minimized
      // so the stage projection continues at the set pace.
      backgroundThrottling: false,
    },
  })

  operatorWin.once('ready-to-show', () => operatorWin?.show())
  operatorWin.on('closed', () => {
    operatorWin = null
  })

  wireExternalLinks(operatorWin)
  await loadRole(operatorWin, 'operator')
  return operatorWin
}

function focusStageWindow() {
  if (!stageWin || stageWin.isDestroyed()) return false
  if (stageWin.isMinimized()) stageWin.restore()
  stageWin.show()
  stageWin.focus()
  return true
}

function listDisplays() {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: d.label || `Display ${d.id}`,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    primary: d.id === primaryId,
  }))
}

function displayForBounds(bounds: Electron.Rectangle) {
  const cx = bounds.x + Math.floor(bounds.width / 2)
  const cy = bounds.y + Math.floor(bounds.height / 2)
  return screen.getDisplayNearestPoint({ x: cx, y: cy })
}

function suggestedProjectorId(displays: ReturnType<typeof listDisplays>) {
  const external = displays.filter((d) => !d.primary)
  const pool = external.length > 0 ? external : displays
  let best = pool[0] ?? null
  for (const d of pool) {
    const area = d.bounds.width * d.bounds.height
    const bestArea = best ? best.bounds.width * best.bounds.height : 0
    if (!best || area > bestArea) best = d
  }
  return best?.id ?? null
}

function getStageDisplayStatus() {
  const displays = listDisplays()
  if (!stageWin || stageWin.isDestroyed()) {
    return {
      available: false,
      bounds: null,
      isFullScreen: false,
      isMaximized: false,
      displayId: null,
      displayLabel: null,
      resolution: null,
      onPrimary: null,
      displays,
      suggestedProjectorId: suggestedProjectorId(displays),
    }
  }
  const bounds = stageWin.getBounds()
  const display = displayForBounds(bounds)
  const primaryId = screen.getPrimaryDisplay().id
  return {
    available: true,
    bounds,
    isFullScreen: stageWin.isFullScreen(),
    isMaximized: stageWin.isMaximized(),
    displayId: display.id,
    displayLabel: display.label || `Display ${display.id}`,
    resolution: `${bounds.width}×${bounds.height}`,
    onPrimary: display.id === primaryId,
    displays,
    suggestedProjectorId: suggestedProjectorId(displays),
  }
}

function moveStageToDisplay(displayId: number, opts?: { fullscreen?: boolean }) {
  if (!stageWin || stageWin.isDestroyed()) return { ok: false as const, reason: 'Stage window is not open' }
  const target = screen.getAllDisplays().find((d) => d.id === displayId)
  if (!target) return { ok: false as const, reason: 'Display not found' }

  const wantFs = opts?.fullscreen !== false
  if (stageWin.isFullScreen()) stageWin.setFullScreen(false)

  const wa = target.workArea
  const width = Math.min(1400, Math.max(900, wa.width - 80))
  const height = Math.min(900, Math.max(600, wa.height - 80))
  stageWin.setBounds({
    x: wa.x + Math.floor((wa.width - width) / 2),
    y: wa.y + Math.floor((wa.height - height) / 2),
    width,
    height,
  })
  stageWin.show()
  stageWin.focus()
  if (wantFs) {
    // Defer so the OS applies bounds on the target display first.
    setTimeout(() => {
      if (stageWin && !stageWin.isDestroyed()) stageWin.setFullScreen(true)
    }, 80)
  }
  return { ok: true as const, status: getStageDisplayStatus() }
}

function setStageFullscreen(fullscreen: boolean) {
  if (!stageWin || stageWin.isDestroyed()) return { ok: false as const, reason: 'Stage window is not open' }
  stageWin.setFullScreen(fullscreen)
  stageWin.show()
  return { ok: true as const, status: getStageDisplayStatus() }
}

function buildAppMenu() {
  const canUninstall = Boolean(findUninstaller())
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Draw Down',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        ...(canUninstall
          ? [
              {
                label: 'Uninstall Draw Down…',
                click: () => {
                  void launchUninstaller()
                },
              } satisfies Electron.MenuItemConstructorOptions,
              { type: 'separator' as const },
            ]
          : []),
        process.platform === 'darwin' ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Operator controls',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            void createOperatorWindow()
          },
        },
        {
          label: 'Stage display',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            focusStageWindow()
          },
        },
        {
          label: 'Toggle operator always on top',
          click: () => {
            if (!operatorWin || operatorWin.isDestroyed()) return
            operatorWin.setAlwaysOnTop(!operatorWin.isAlwaysOnTop())
          },
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'front' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function auditsDir() {
  return path.join(app.getPath('userData'), 'audits')
}

async function ensureAuditsDir() {
  await fsp.mkdir(auditsDir(), { recursive: true })
}

ipcMain.handle('draw-down:get-install-info', () => getInstallInfo())
ipcMain.handle('draw-down:get-data-info', () => ({
  userData: app.getPath('userData'),
  auditsDir: auditsDir(),
  licenseKey: 'draw-down.license.v1',
  sessionKey: 'draw-down.session.v1',
}))
ipcMain.handle('draw-down:uninstall', () => launchUninstaller())
ipcMain.handle('draw-down:show-operator', async () => {
  await createOperatorWindow()
  return { ok: true }
})
ipcMain.handle('draw-down:focus-stage', () => ({ ok: focusStageWindow() }))
ipcMain.handle('draw-down:get-stage-display-status', () => getStageDisplayStatus())
ipcMain.handle(
  'draw-down:move-stage-to-display',
  (_event, displayId: number, opts?: { fullscreen?: boolean }) =>
    moveStageToDisplay(Number(displayId), opts),
)
ipcMain.handle('draw-down:move-stage-to-projector', () => {
  const status = getStageDisplayStatus()
  const id = status.suggestedProjectorId
  if (id == null) return { ok: false as const, reason: 'No display available' }
  return moveStageToDisplay(id, { fullscreen: true })
})
ipcMain.handle('draw-down:set-stage-fullscreen', (_event, fullscreen: boolean) =>
  setStageFullscreen(Boolean(fullscreen)),
)
ipcMain.handle('draw-down:audit-save', async (_event, blob: { package: { eventId: string } }) => {
  try {
    await ensureAuditsDir()
    const id = String(blob?.package?.eventId || '').replace(/[^\w.-]/g, '_')
    if (!id) return { ok: false, reason: 'missing eventId' }
    const file = path.join(auditsDir(), `${id}.json`)
    const tmp = `${file}.tmp`
    const payload = JSON.stringify(blob)
    const fh = await fsp.open(tmp, 'w')
    try {
      await fh.writeFile(payload, 'utf8')
      await fh.sync()
    } finally {
      await fh.close()
    }
    await fsp.rename(tmp, file)
    return { ok: true, path: file }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'audit save failed' }
  }
})
ipcMain.handle('draw-down:audit-load', async (_event, eventId: string) => {
  try {
    const id = String(eventId || '').replace(/[^\w.-]/g, '_')
    const file = path.join(auditsDir(), `${id}.json`)
    const text = await fsp.readFile(file, 'utf8')
    return { ok: true, blob: JSON.parse(text) }
  } catch {
    return { ok: false, blob: null }
  }
})
ipcMain.handle('draw-down:audit-list', async () => {
  try {
    await ensureAuditsDir()
    const dir = auditsDir()
    const names = await fsp.readdir(dir)
    const items: Array<{ eventId: string; mtimeMs: number; blob: unknown }> = []
    for (const name of names) {
      if (!name.endsWith('.json') || name.endsWith('.tmp')) continue
      const file = path.join(dir, name)
      try {
        const [text, st] = await Promise.all([fsp.readFile(file, 'utf8'), fsp.stat(file)])
        const blob = JSON.parse(text) as { package?: { eventId?: string } }
        const eventId = String(blob?.package?.eventId || name.replace(/\.json$/i, ''))
        items.push({ eventId, mtimeMs: st.mtimeMs, blob })
      } catch {
        // skip corrupt individual files
      }
    }
    items.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return { ok: true, items }
  } catch (error) {
    return {
      ok: false,
      items: [],
      reason: error instanceof Error ? error.message : 'audit list failed',
    }
  }
})
ipcMain.handle('draw-down:audit-archive', async (_event, eventId: string) => {
  try {
    await ensureAuditsDir()
    const id = String(eventId || '').replace(/[^\w.-]/g, '_')
    if (!id) return { ok: false, reason: 'missing eventId' }
    const file = path.join(auditsDir(), `${id}.json`)
    const archiveDir = path.join(auditsDir(), 'archived')
    await fsp.mkdir(archiveDir, { recursive: true })
    const dest = path.join(archiveDir, `${id}-${Date.now()}.json`)
    await fsp.rename(file, dest)
    return { ok: true, path: dest }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'audit archive failed' }
  }
})
ipcMain.on('draw-down:bridge', (event, message) => {
  broadcastBridge(message, event.sender)
})

app.whenReady().then(async () => {
  buildAppMenu()
  await createStageWindow()
  await createOperatorWindow()
})

app.on('window-all-closed', () => {
  stageWin = null
  operatorWin = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  focusStageWindow()
  void createOperatorWindow()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void (async () => {
      await createStageWindow()
      await createOperatorWindow()
    })()
  } else {
    focusStageWindow()
  }
})
