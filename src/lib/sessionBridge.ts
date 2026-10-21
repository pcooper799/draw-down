import type { DrawEvent, DrawStatus, SessionConfig, Ticket } from '@/types'
import type { LicenseStatus } from '@/lib/license'

const CHANNEL = 'draw-down.bridge.v1'
const STORAGE_STATE_KEY = 'draw-down.bridge.state.v1'

/** Serializable stage view + license for the mirror window. */
export type BridgeViewState = {
  v: 1
  at: number
  config: SessionConfig
  pool: Ticket[]
  heldOut: number[]
  eliminated: number[]
  history: DrawEvent[]
  lastDrawn: DrawEvent | null
  status: DrawStatus
  flashKey: number
  remaining: number
  insuredRemaining: number
  digits: number
  insuranceMarks: number[]
  license: LicenseStatus
  saveNotice: string | null
  lastSavedAt: string | null
}

export type BridgeCommand =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'emergencyStop' }
  | { type: 'confirmSafeResume' }
  | { type: 'reset' }
  | { type: 'save' }
  | { type: 'toggleHold'; ticket: number }
  | { type: 'setTicketInsured'; ticket: number; insured: boolean }
  | { type: 'clearAllInsurance' }
  | { type: 'continueWithNewStop'; stopAt: number; resume: boolean }
  | { type: 'applyConfig'; patch: Partial<SessionConfig> }
  | { type: 'commitTotalTickets'; total: number }
  | { type: 'clearActivation' }
  | { type: 'requestState' }
  | { type: 'focusStage' }
  | { type: 'showOperator' }

type BridgeEnvelope =
  | { kind: 'state'; state: BridgeViewState }
  | { kind: 'cmd'; cmd: BridgeCommand; from: string; id?: string }

type Listener = (msg: BridgeEnvelope) => void

function instanceId() {
  const key = 'draw-down.bridge.instance'
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem(key, id)
    return id
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}

const selfId = typeof window !== 'undefined' ? instanceId() : 'ssr'

/** Prefer Electron IPC when present so cmds are not double-delivered with BroadcastChannel. */
function hasElectronBridge() {
  return Boolean(window.drawDown?.bridgePublish && window.drawDown?.onBridgeMessage)
}

function postViaElectron(msg: BridgeEnvelope) {
  window.drawDown?.bridgePublish?.(msg)
}

function postViaBroadcast(msg: BridgeEnvelope) {
  try {
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage(msg)
    ch.close()
  } catch {
    // ignore
  }
}

function postEnvelope(msg: BridgeEnvelope) {
  if (hasElectronBridge()) {
    postViaElectron(msg)
    return
  }
  postViaBroadcast(msg)
}

function newCmdId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function publishBridgeState(state: BridgeViewState) {
  try {
    localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(state))
  } catch {
    // quota
  }
  const envelope: BridgeEnvelope = { kind: 'state', state }
  postEnvelope(envelope)
}

export function sendBridgeCommand(cmd: BridgeCommand) {
  const envelope: BridgeEnvelope = { kind: 'cmd', cmd, from: selfId, id: newCmdId() }
  postEnvelope(envelope)
}

export function readCachedBridgeState(): BridgeViewState | null {
  try {
    const raw = localStorage.getItem(STORAGE_STATE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as BridgeViewState
    if (data?.v !== 1) return null
    return data
  } catch {
    return null
  }
}

export function subscribeBridge(listener: Listener) {
  const recentCmdIds = new Map<string, number>()
  const DEDUPE_MS = 1500

  const deliver = (msg: BridgeEnvelope) => {
    if (msg.kind === 'cmd') {
      if (msg.from === selfId) return
      if (msg.id) {
        const now = Date.now()
        for (const [id, at] of recentCmdIds) {
          if (now - at > DEDUPE_MS) recentCmdIds.delete(id)
        }
        if (recentCmdIds.has(msg.id)) return
        recentCmdIds.set(msg.id, now)
      }
    }
    listener(msg)
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_STATE_KEY || !event.newValue) return
    try {
      const state = JSON.parse(event.newValue) as BridgeViewState
      if (state?.v === 1) deliver({ kind: 'state', state })
    } catch {
      // ignore
    }
  }

  let channel: BroadcastChannel | null = null
  let unsubElectron: (() => void) | undefined

  if (hasElectronBridge()) {
    unsubElectron = window.drawDown?.onBridgeMessage?.((msg) => {
      const envelope = msg as BridgeEnvelope
      if (!envelope || (envelope.kind !== 'state' && envelope.kind !== 'cmd')) return
      deliver(envelope)
    })
  } else {
    try {
      channel = new BroadcastChannel(CHANNEL)
      channel.onmessage = (event) => {
        const msg = event.data as BridgeEnvelope
        if (!msg || (msg.kind !== 'state' && msg.kind !== 'cmd')) return
        deliver(msg)
      }
    } catch {
      channel = null
    }
  }

  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener('storage', onStorage)
    channel?.close()
    unsubElectron?.()
  }
}

export function openOperatorPopup() {
  const url = new URL(window.location.href)
  url.searchParams.set('window', 'operator')
  const features = 'popup=yes,width=440,height=900,menubar=no,toolbar=no,location=no,status=no'
  const popup = window.open(url.toString(), 'draw-down-operator', features)
  return popup
}

export async function openOperatorWindowElectron() {
  if (window.drawDown?.showOperatorWindow) {
    await window.drawDown.showOperatorWindow()
    return true
  }
  openOperatorPopup()
  return false
}

export async function focusStageWindowElectron() {
  if (window.drawDown?.focusStageWindow) {
    await window.drawDown.focusStageWindow()
    return true
  }
  return false
}
