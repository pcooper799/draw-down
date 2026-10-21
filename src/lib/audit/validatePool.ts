import type { Ticket } from '@/types'

export type PoolValidation = {
  ok: boolean
  eligibleCount: number
  eligibleSorted: number[]
  reason?: string
}

/**
 * Before every selection: pool must match eliminated/held invariants.
 * Eligible = in pool; must not include eliminated or held numbers.
 */
export function validateEligiblePool(input: {
  totalTickets: number
  pool: Ticket[]
  eliminated: number[]
  heldOut: number[]
}): PoolValidation {
  const { totalTickets, pool, eliminated, heldOut } = input
  const out = new Set(eliminated)
  const held = new Set(heldOut)
  const seen = new Set<number>()
  const eligibleSorted: number[] = []

  for (const t of pool) {
    const n = t.number
    if (!Number.isFinite(n) || n < 1 || n > totalTickets) {
      return {
        ok: false,
        eligibleCount: 0,
        eligibleSorted: [],
        reason: `Pool contains out-of-range ticket ${n}`,
      }
    }
    if (out.has(n)) {
      return {
        ok: false,
        eligibleCount: 0,
        eligibleSorted: [],
        reason: `Eliminated ticket ${n} still in pool`,
      }
    }
    if (held.has(n)) {
      return {
        ok: false,
        eligibleCount: 0,
        eligibleSorted: [],
        reason: `Held ticket ${n} still in pool`,
      }
    }
    if (seen.has(n)) {
      return {
        ok: false,
        eligibleCount: 0,
        eligibleSorted: [],
        reason: `Duplicate ticket ${n} in pool`,
      }
    }
    seen.add(n)
    eligibleSorted.push(n)
  }

  eligibleSorted.sort((a, b) => a - b)

  // Held and eliminated must be disjoint
  for (const n of held) {
    if (out.has(n)) {
      return {
        ok: false,
        eligibleCount: 0,
        eligibleSorted: [],
        reason: `Ticket ${n} is both held and eliminated`,
      }
    }
  }

  const expectedEligible = totalTickets - out.size - held.size
  if (pool.length !== expectedEligible) {
    return {
      ok: false,
      eligibleCount: pool.length,
      eligibleSorted,
      reason: `Eligible count ${pool.length} != total(${totalTickets}) - out(${out.size}) - held(${held.size}) = ${expectedEligible}`,
    }
  }

  return { ok: true, eligibleCount: pool.length, eligibleSorted }
}
