import { contextBridge, ipcRenderer } from 'electron'

export type InstallInfo = {
  packaged: boolean
  platform: NodeJS.Platform
  canUninstall: boolean
  installDir: string | null
}

export type UninstallResult = {
  ok: boolean
  reason?: string
}

export type LocalDataInfo = {
  userData: string
  auditsDir: string
  licenseKey: string
  sessionKey: string
}

type BridgeHandler = (message: unknown) => void

contextBridge.exposeInMainWorld('drawDown', {
  platform: process.platform as NodeJS.Platform,
  getInstallInfo: (): Promise<InstallInfo> => ipcRenderer.invoke('draw-down:get-install-info'),
  getDataInfo: (): Promise<LocalDataInfo> => ipcRenderer.invoke('draw-down:get-data-info'),
  uninstall: (): Promise<UninstallResult> => ipcRenderer.invoke('draw-down:uninstall'),
  showOperatorWindow: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('draw-down:show-operator'),
  focusStageWindow: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('draw-down:focus-stage'),
  auditSave: (blob: unknown): Promise<{ ok: boolean; path?: string; reason?: string }> =>
    ipcRenderer.invoke('draw-down:audit-save', blob),
  auditLoad: (
    eventId: string,
  ): Promise<{ ok: boolean; blob: unknown | null }> =>
    ipcRenderer.invoke('draw-down:audit-load', eventId),
  bridgePublish: (message: unknown) => {
    ipcRenderer.send('draw-down:bridge', message)
  },
  onBridgeMessage: (handler: BridgeHandler) => {
    const listener = (_event: Electron.IpcRendererEvent, message: unknown) => {
      handler(message)
    }
    ipcRenderer.on('draw-down:bridge', listener)
    return () => {
      ipcRenderer.removeListener('draw-down:bridge', listener)
    }
  },
})

function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (![...parent.children].includes(child)) parent.appendChild(child)
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if ([...parent.children].includes(child)) parent.removeChild(child)
  },
}

function useLoading() {
  const style = document.createElement('style')
  style.id = 'draw-down-loading-style'
  style.textContent = `
    .dd-loading {
      position: fixed; inset: 0; z-index: 50;
      display: grid; place-items: center;
      background: #0b1210; color: #f3e6c8;
      font-family: "Archivo Black", Impact, sans-serif;
      letter-spacing: 0.08em;
    }
    .dd-loading span {
      animation: dd-pulse 1.2s ease-in-out infinite;
    }
    @keyframes dd-pulse {
      0%, 100% { opacity: 0.45; transform: scale(0.98); }
      50% { opacity: 1; transform: scale(1); }
    }
  `
  const wrap = document.createElement('div')
  wrap.className = 'dd-loading'
  wrap.innerHTML = '<span>DRAW DOWN</span>'

  return {
    appendLoading() {
      safeDOM.append(document.head, style)
      safeDOM.append(document.body, wrap)
    },
    removeLoading() {
      safeDOM.remove(document.head, style)
      safeDOM.remove(document.body, wrap)
    },
  }
}

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)
window.onmessage = (ev) => {
  if (ev.data?.payload === 'removeLoading') removeLoading()
}
setTimeout(removeLoading, 4000)
