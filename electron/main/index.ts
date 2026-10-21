import { app, BrowserWindow, ipcMain, Menu, screen, shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
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

ipcMain.handle('draw-down:get-install-info', () => getInstallInfo())
ipcMain.handle('draw-down:uninstall', () => launchUninstaller())
ipcMain.handle('draw-down:show-operator', async () => {
  await createOperatorWindow()
  return { ok: true }
})
ipcMain.handle('draw-down:focus-stage', () => ({ ok: focusStageWindow() }))
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
