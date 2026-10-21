import { GENESIS_HASH, type AuditEntry, type AuditEventType, type AuditPackage, type AuditSeedState } from '@/lib/audit/types'
import { hashAuditEntry, verifyHashChain } from '@/lib/audit/hashChain'
import {
  deriveSeed,
  randomSeedBytes,
  seedCommitment,
  seedFromHex,
  seedToHex,
  unbiasedIndex,
} from '@/lib/audit/rng'

function isoNow(ms = Date.now()) {
  return new Date(ms).toISOString()
}

function newEventId() {
  const bytes = randomSeedBytes(16)
  return `evt_${seedToHex(bytes)}`
}

export class AuditEngine {
  eventId: string
  eventName: string
  createdAt: string
  startingTickets: number
  entries: AuditEntry[] = []
  seed: AuditSeedState
  finalized = false
  private selectionCount = 0
  /** Secret seed bytes — never exported until reveal. */
  private seedBytes: Uint8Array | null = null

  constructor(input?: {
    eventId?: string
    eventName?: string
    startingTickets?: number
    package?: AuditPackage
    localSeedHex?: string
  }) {
    if (input?.package) {
      const pkg = input.package
      this.eventId = pkg.eventId
      this.eventName = pkg.eventName
      this.createdAt = pkg.createdAt
      this.startingTickets = pkg.startingTickets
      this.entries = [...pkg.entries]
      this.seed = { ...pkg.seed }
      this.finalized = pkg.finalized
      this.selectionCount = this.entries.filter((e) => e.type === 'draw_selection').length
      const hex = input.localSeedHex ?? pkg.seed.seedHex
      this.seedBytes = hex ? seedFromHex(hex) : null
      return
    }

    this.eventId = input?.eventId ?? newEventId()
    this.eventName = input?.eventName ?? 'Untitled event'
    this.createdAt = isoNow()
    this.startingTickets = input?.startingTickets ?? 0
    this.seed = { commitment: '', revealed: false, counter: 0 }
  }

  get lastHash() {
    return this.entries.length ? this.entries[this.entries.length - 1]!.hash : GENESIS_HASH
  }

  /** Create CSPRNG seed + public commitment before first draw. */
  commitSeed(options?: { witness?: string }) {
    if (this.seed.commitment) return this.seed
    const secret = randomSeedBytes(32)
    const seed = deriveSeed(secret, options?.witness)
    this.seedBytes = seed
    this.seed = {
      commitment: seedCommitment(seed),
      revealed: false,
      counter: 0,
      witness: options?.witness?.trim() || undefined,
    }
    this.append({
      type: 'seed_committed',
      seedCommitment: this.seed.commitment,
      note: 'SHA-256 commitment recorded before first selection',
      details: options?.witness?.trim()
        ? { witnessIncluded: true }
        : { witnessIncluded: false },
    })
    return this.seed
  }

  ensureSeed() {
    if (!this.seed.commitment || !this.seedBytes) this.commitSeed()
  }

  revealSeed() {
    this.ensureSeed()
    if (!this.seedBytes) throw new Error('No seed to reveal')
    const hex = seedToHex(this.seedBytes)
    this.seed.seedHex = hex
    this.seed.revealed = true
    this.append({
      type: 'seed_revealed',
      seedCommitment: this.seed.commitment,
      seedRevealed: hex,
      note: 'Seed revealed for independent verification',
    })
    this.finalized = true
    this.append({ type: 'finalize', note: 'Drawing finalized for verification export' })
    return hex
  }

  pickUnbiasedIndex(eligibleSorted: number[]) {
    this.ensureSeed()
    if (!this.seedBytes) throw new Error('Seed missing')
    const n = eligibleSorted.length
    const result = unbiasedIndex(this.seedBytes, this.seed.counter, n)
    this.seed.counter = result.counterAfter
    return {
      index: result.index,
      ticket: eligibleSorted[result.index]!,
      rng: {
        counter: result.counterAfter - 1,
        drawBytesHex: result.drawBytesHex,
        index: result.index,
        eligibleSorted: [...eligibleSorted],
      },
    }
  }

  nextSelectionNumber() {
    this.selectionCount += 1
    return this.selectionCount
  }

  append(
    partial: Omit<
      AuditEntry,
      'seq' | 'prevHash' | 'hash' | 'at' | 'eventId' | 'eventName' | 'operatorId'
    > & { at?: string; operatorId?: string },
  ): AuditEntry {
    const body = {
      seq: this.entries.length + 1,
      prevHash: this.lastHash,
      at: partial.at ?? isoNow(),
      eventId: this.eventId,
      eventName: this.eventName,
      operatorId: partial.operatorId ?? 'local-operator',
      type: partial.type,
      selectionNumber: partial.selectionNumber,
      eligibleBefore: partial.eligibleBefore,
      eligibleAfter: partial.eligibleAfter,
      ticket: partial.ticket,
      prevState: partial.prevState,
      nextState: partial.nextState,
      insuranceConsumed: partial.insuranceConsumed,
      permanentlyEliminated: partial.permanentlyEliminated,
      stopAt: partial.stopAt,
      auctionPrice: partial.auctionPrice ?? null,
      rng: partial.rng,
      seedCommitment: partial.seedCommitment,
      seedRevealed: partial.seedRevealed,
      note: partial.note,
      details: partial.details,
    }
    const entry: AuditEntry = { ...body, hash: hashAuditEntry(body) }
    this.entries.push(entry)
    return entry
  }

  setEventName(name: string) {
    if (name && name !== this.eventName) {
      const prev = this.eventName
      this.eventName = name
      this.append({
        type: 'config_changed',
        note: 'Event name changed',
        details: { prev, next: name },
      })
    }
  }

  toPackage(): AuditPackage {
    return {
      format: 'draw-down-audit-v1',
      eventId: this.eventId,
      eventName: this.eventName,
      createdAt: this.createdAt,
      updatedAt: isoNow(),
      startingTickets: this.startingTickets,
      seed: {
        commitment: this.seed.commitment,
        revealed: this.seed.revealed,
        counter: this.seed.counter,
        witness: this.seed.witness,
        // Only include seed after reveal in exportable package
        seedHex: this.seed.revealed ? this.seed.seedHex : undefined,
      },
      entries: [...this.entries],
      finalized: this.finalized,
    }
  }

  /** Local crash-recovery blob may include unrevealed seed. */
  toLocalPersist() {
    return {
      package: this.toPackage(),
      localSeedHex: this.seedBytes ? seedToHex(this.seedBytes) : undefined,
    }
  }

  static fromLocalPersist(raw: {
    package: AuditPackage
    localSeedHex?: string
  }) {
    return new AuditEngine({ package: raw.package, localSeedHex: raw.localSeedHex })
  }

  verifyChain() {
    return verifyHashChain(this.entries)
  }
}

export type { AuditEventType }
