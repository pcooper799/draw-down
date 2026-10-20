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
  orgName: string
  brandImageDataUrl: string | null
}

export const DEFAULT_CONFIG: SessionConfig = {
  totalTickets: 400,
  stopAt: 1,
  paceMs: 2500,
  orgName: 'Your Organization',
  brandImageDataUrl: null,
}
