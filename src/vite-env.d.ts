/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string
  export default content
}

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

type DrawDownLocalDataInfo = {
  userData: string
  auditsDir: string
  licenseKey: string
  sessionKey: string
}

type DrawDownDisplayInfo = {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  primary: boolean
}

type DrawDownStageDisplayStatus = {
  available: boolean
  bounds: { x: number; y: number; width: number; height: number } | null
  isFullScreen: boolean
  isMaximized: boolean
  displayId: number | null
  displayLabel: string | null
  resolution: string | null
  onPrimary: boolean | null
  displays: DrawDownDisplayInfo[]
  suggestedProjectorId: number | null
}

interface Window {
  drawDown?: {
    platform: NodeJS.Platform
    getInstallInfo?: () => Promise<DrawDownInstallInfo>
    getDataInfo?: () => Promise<DrawDownLocalDataInfo>
    uninstall?: () => Promise<DrawDownUninstallResult>
    showOperatorWindow?: () => Promise<{ ok: boolean }>
    focusStageWindow?: () => Promise<{ ok: boolean }>
    getStageDisplayStatus?: () => Promise<DrawDownStageDisplayStatus>
    moveStageToDisplay?: (
      displayId: number,
      opts?: { fullscreen?: boolean },
    ) => Promise<{ ok: boolean; reason?: string; status?: DrawDownStageDisplayStatus }>
    moveStageToProjector?: () => Promise<{
      ok: boolean
      reason?: string
      status?: DrawDownStageDisplayStatus
    }>
    setStageFullscreen?: (
      fullscreen: boolean,
    ) => Promise<{ ok: boolean; reason?: string; status?: DrawDownStageDisplayStatus }>
    auditSave?: (blob: unknown) => Promise<{ ok: boolean; path?: string; reason?: string }>
    auditLoad?: (eventId: string) => Promise<{ ok: boolean; blob: unknown | null }>
    auditList?: () => Promise<{
      ok: boolean
      items: Array<{ eventId: string; mtimeMs: number; blob: unknown }>
      reason?: string
    }>
    auditArchive?: (eventId: string) => Promise<{ ok: boolean; path?: string; reason?: string }>
    bridgePublish?: (message: unknown) => void
    onBridgeMessage?: (handler: (message: unknown) => void) => () => void
  }
}
