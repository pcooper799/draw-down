/// <reference types="vite/client" />

type DrawDownInstallInfo = {
  packaged: boolean
  platform: NodeJS.Platform
  canUninstall: boolean
  installDir: string | null
}

type DrawDownUninstallResult = {
  ok: boolean
  reason?: string
}

interface Window {
  drawDown?: {
    platform: NodeJS.Platform
    getInstallInfo?: () => Promise<DrawDownInstallInfo>
    uninstall?: () => Promise<DrawDownUninstallResult>
    showOperatorWindow?: () => Promise<{ ok: boolean }>
    focusStageWindow?: () => Promise<{ ok: boolean }>
    bridgePublish?: (message: unknown) => void
    onBridgeMessage?: (handler: (message: unknown) => void) => () => void
  }
}
