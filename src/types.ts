export type DrawStatus = 'idle' | 'running' | 'paused' | 'finished'

export type Ticket = {
  number: number
  insured: boolean
}

export type DrawEvent = {
  id: string
  ticket: number
  insured: boolean
  outcome: 'eliminated' | 'returned'
  at: number
}

export type SessionConfig = {
  totalTickets: number
  stopAt: number
  paceMs: number
  /** Board cell size multiplier (1 = default). Persists with session autosave. */
  ticketScale: number
  /**
   * Planned prize stop levels (remaining counts), highest first — e.g. [10, 5, 1].
   * First entry is the initial stopAt when applying the setup wizard.
   */
  prizeTiers: number[]
  orgName: string
  brandImageDataUrl: string | null
}

export const DEFAULT_CONFIG: SessionConfig = {
  totalTickets: 400,
  stopAt: 1,
  paceMs: 2500,
  ticketScale: 1,
  prizeTiers: [1],
  orgName: 'Your Organization',
  brandImageDataUrl: null,
}
