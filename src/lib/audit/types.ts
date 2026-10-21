export type TicketVisualState = 'active' | 'insured' | 'held' | 'eliminated'

export type AuditEventType =
  | 'event_created'
  | 'seed_committed'
  | 'seed_revealed'
  | 'draw_selection'
  | 'insurance_marked'
  | 'insurance_cleared'
  | 'hold'
  | 'release'
  | 'stop_reached'
  | 'continue'
  | 'pause'
  | 'start'
  | 'resume'
  | 'stop_at_changed'
  | 'reset'
  | 'config_changed'
  | 'integrity_halt'
  | 'finalize'

export type AuditRngTrace = {
  /** Monotonic counter used with the secret seed for this selection. */
  counter: number
  /** Hex of CSPRNG bytes consumed for the unbiased index. */
  drawBytesHex: string
  /** Chosen index into the sorted eligible ticket list. */
  index: number
  /** Eligible tickets in sorted order at selection time (for independent replay). */
  eligibleSorted: number[]
}

/** Canonical audit entry — hash covers all fields except `hash` itself. */
export type AuditEntry = {
  seq: number
  prevHash: string
  hash: string
  at: string
  eventId: string
  eventName: string
  operatorId: string
  type: AuditEventType
  selectionNumber?: number
  eligibleBefore?: number
  eligibleAfter?: number
  ticket?: number
  prevState?: TicketVisualState
  nextState?: TicketVisualState
  insuranceConsumed?: boolean
  permanentlyEliminated?: boolean
  stopAt?: number
  auctionPrice?: number | null
  rng?: AuditRngTrace
  seedCommitment?: string
  seedRevealed?: string
  note?: string
  details?: Record<string, unknown>
}

export type AuditSeedState = {
  commitment: string
  /** Present only in local durable store / after reveal. */
  seedHex?: string
  revealed: boolean
  counter: number
  /** Optional public witness mixed into seed at creation. */
  witness?: string
}

export type AuditPackage = {
  format: 'draw-down-audit-v1'
  eventId: string
  eventName: string
  createdAt: string
  updatedAt: string
  startingTickets: number
  seed: AuditSeedState
  entries: AuditEntry[]
  finalized: boolean
}

export const GENESIS_HASH = '0'.repeat(64)
export const AUDIT_OPERATOR_ID = 'local-operator'
