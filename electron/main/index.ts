import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
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

let win: BrowserWindow | null = null
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
    // Detach so the uninstaller can close this process and finish removal.
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
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function createWindow() {
  win = new BrowserWindow({
    title: 'Draw Down',
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b1210',
    show: false,
    icon: resolveAppIcon(),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => win?.show())

  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    await win.loadFile(indexHtml)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

ipcMain.handle('draw-down:get-install-info', () => getInstallInfo())
ipcMain.handle('draw-down:uninstall', () => launchUninstaller())

app.whenReady().then(() => {
  buildAppMenu()
  void createWindow()
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    void createWindow()
  }
})
