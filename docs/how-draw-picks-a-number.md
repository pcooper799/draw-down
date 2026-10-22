# How Draw Down picks a number

**Audience:** organizers, auditors, and engineers who need a precise account of selection mechanics.  
**Applies to:** Draw Down **v0.4.3** (audit format `draw-down-audit-v1`, RNG domain `draw-down-rng-v1`).  
**Source of truth in code:** `src/lib/audit/rng.ts`, `src/lib/audit/engine.ts`, `src/lib/audit/validatePool.ts`, `src/hooks/useDrawSession.ts` (`drawOnce`).

This document explains, end to end, how one ticket number is chosen on each draw: what is eligible, how entropy is obtained, how that entropy is turned into an index without bias, how the index maps to a ticket, what happens after the pick (insurance vs elimination), and how an independent party can reproduce the same sequence from a revealed seed.

---

## 1. What “picking a number” means

Draw Down does **not** roll a random integer in the range `1 … totalTickets` and then check whether that ticket is still alive. That approach would waste entropy on already-eliminated or held numbers and would require awkward retry logic that is hard to audit.

Instead, each selection is:

1. Build the **eligible set** — ticket numbers still in the live pool (not eliminated, not held).
2. Sort that set ascending into a list `eligibleSorted[0 … n−1]`.
3. Sample an **unbiased index** `i ∈ {0, 1, …, n−1}` from a cryptographic deterministic generator.
4. The drawn ticket is `eligibleSorted[i]`.

So the random object is always an **index into a frozen, sorted snapshot of the current eligible list**, not a raw ticket number. The ticket number is a deterministic lookup from that index.

---

## 2. End-to-end call path (one selection)

When the operator starts or continues a running event, the session hook schedules `drawOnce` on the configured pace timer (`paceMs`, clamped 200–60_000 ms).

Inside `drawOnce` (simplified):

```
if pool.length == 0 or pool.length ≤ stopAt → finish; return

validation = validateEligiblePool({ totalTickets, pool, eliminated, heldOut })
if not validation.ok → append integrity_halt; pause; return

ensureSeed() / commitSeed() if needed
pick = AuditEngine.pickUnbiasedIndex(validation.eligibleSorted)
ticket = pool.find(number == pick.ticket)

append draw_selection { ticket, rng: pick.rng, insurance/elim flags, … }
persist durable audit (write + fsync + rename in Electron)
mutate UI state (history, flash, pool, eliminated / insurance)
if nextPool.length ≤ stopAt → append stop_reached; finish
```

Important ordering properties:

- **Pool validation runs before RNG.** A corrupt or inconsistent pool never reaches `pickUnbiasedIndex`.
- **Audit is persisted before the UI mutates.** A crash after commit but before paint can recover the committed draw from the durable audit blob.
- **Held tickets are absent from `pool`**, so they cannot be selected even if someone later tampers with a display layer.

---

## 3. Eligible pool: what can be chosen

### 3.1 Ticket universe

Tickets are integers in `1 … totalTickets` inclusive. Product limits: `MIN_TICKETS = 1`, `MAX_TICKETS = 2500` (`src/lib/drawRules.ts`).

### 3.2 Live pool vs side sets

Runtime state tracks:

| Structure | Meaning |
|-----------|---------|
| `pool` | Array of live `Ticket` objects (`{ number, insured }`) — **only these can be drawn** |
| `eliminated` | Permanently out (uninsured draws) |
| `heldOut` | Temporarily out for auction / hold — not drawable until released |
| `insuranceMarks` | Which numbers currently carry insurance (also reflected on `Ticket.insured`) |

Invariant enforced by `validateEligiblePool`:

```
|pool| = totalTickets − |eliminated| − |heldOut|
```

and every number in `pool` is unique, in range, not in `eliminated`, not in `heldOut`. Held and eliminated must be disjoint.

### 3.3 Sorted eligible list

Validation builds `eligibleSorted` by collecting every `pool[i].number`, then sorting ascending:

```
eligibleSorted.sort((a, b) => a - b)
```

**Why sort?** The RNG returns an index. Independent verifiers must agree on what “index 3” means. Sorting removes dependence on the UI’s board order, React render order, or insertion history. Two machines with the same set of remaining tickets always produce the same `eligibleSorted` array.

### 3.4 Held tickets and pre-start holds

- Before **Start**, any in-pool ticket may be held (removed from `pool`).
- After **Start**, only tickets that were held in the frozen `preStartHeld` set may be re-held; restore (unhold) is always allowed.
- Held tickets are **not** in the eligible list, so they have probability **0** of being drawn until released.

Insurance does **not** remove a ticket from eligibility. An insured ticket remains in `pool` with `insured: true` and can still be selected.

---

## 4. Entropy: seed, commitment, and counter

### 4.1 Seed creation (`commitSeed`)

Before the first selection (and typically on first **Start**), `AuditEngine.commitSeed()`:

1. Draws **32 cryptographically secure random bytes** via `crypto.getRandomValues` (`randomSeedBytes(32)`).
2. Optionally mixes a public **witness** string:  
   `seed = SHA-256(secret ‖ UTF-8(witness))` if a witness is provided; otherwise `seed = secret`.
3. Stores `seed` privately in memory (`seedBytes`) and in the local durable persist blob as `localSeedHex` for crash recovery.
4. Publishes **only** the commitment:  
   `commitment = SHA-256(seed)` as lowercase hex (64 hex chars).
5. Appends a `seed_committed` audit entry containing that commitment (not the seed).

The seed is **not** placed in the exportable audit package until the operator explicitly **reveals** it (`revealSeed`), which also finalizes the package.

### 4.2 Why commit-then-reveal

This is a classic commit–reveal pattern:

- **Before / during the event:** outsiders can be shown `seedCommitment`. They cannot predict future draws from the commitment alone (under SHA-256 preimage resistance).
- **After the event:** revealing `seedHex` lets anyone prove that every recorded selection is the unique sequence implied by that seed and the recorded eligible lists — and that the revealed seed matches the earlier commitment.

If the seed were shown up front, a sophisticated adversary who could also influence the eligible set (e.g. strategic holds) might try to grind favorable outcomes. Keeping the seed secret until finalize closes that channel for external observers. Local crash recovery keeps `localSeedHex` on disk so the machine can continue the same sequence after a kill; that local copy is not the public export.

### 4.3 Counter

`AuditSeedState.counter` is a non-negative integer that advances as RNG blocks are consumed. It starts at `0` when the seed is committed. Each call to `unbiasedIndex` begins at the current counter and returns `counterAfter` after consuming one or more blocks (including rejected samples). The engine then stores `seed.counter = counterAfter` for the next selection.

Replay always restarts from counter `0` and walks every `draw_selection` in order, advancing the counter exactly as live play did.

---

## 5. The deterministic generator (CSPRNG construction)

Implementation: `src/lib/audit/rng.ts`.

### 5.1 Domain separation

```
DOMAIN = UTF-8("draw-down-rng-v1")
```

Every RNG block hashes this constant so the same seed cannot be casually reused as a different protocol’s output (domain separation).

### 5.2 Block function

```
rngBlock(seed, counter) =
  SHA-256(
    seed
    ‖ uint64_be(counter)
    ‖ DOMAIN
  )
```

- `seed`: 32 bytes  
- `counter`: encoded as **big-endian unsigned 64-bit** (high 32 bits, then low 32 bits)  
- Output: 32 bytes  

This is a **keyed, counter-mode hash DRBG** (deterministic random bit generator) in the engineering sense: given `(seed, counter)` the block is fixed; advancing the counter yields a new independent-looking block under standard SHA-256 assumptions.

The app does **not** use `Math.random()`, `Date.now()` as entropy for draws, or a Fisher–Yates shuffle of the whole ticket array for selection.

### 5.3 Extracting a 32-bit sample

From each block, only the **first 4 bytes** are used, interpreted as a **big-endian `uint32`**:

```
value = (block[0] << 24) | (block[1] << 16) | (block[2] << 8) | block[3]
```

as an unsigned 32-bit integer in `[0, 2³²)`.

Remaining 28 bytes of the SHA-256 digest are unused for indexing (they still contribute to the hash’s diffusion of the counter).

---

## 6. Unbiased index via rejection sampling

Function: `unbiasedIndex(seed, startCounter, n) → { index, counterAfter, drawBytesHex }`.

Goal: sample uniformly from `{0, 1, …, n−1}` with **no modulo bias**.

### 6.1 The modulo-bias problem

A naive approach is `value % n`. If `2³²` is not divisible by `n`, some residues appear one more time than others. For small `n` the bias is tiny; for large `n` (Draw Down allows up to 2500) it is still small in absolute terms but **unacceptable for an auditable raffle** — every ticket must have exactly equal probability among those currently eligible.

### 6.2 Rejection threshold

```
limit = floor(2³² / n) * n
```

Accept `value` only when `value < limit`. Then:

```
index = value % n
```

is uniform on `{0,…,n−1}`, because the accepted range is an exact multiple of `n`.

Values in `[limit, 2³²)` are **rejected**: the counter increments, a new block is hashed, and sampling retries. A hard guard of 10_000 attempts exists as a fail-safe (practically unreachable for `n ≤ 2500`).

Special case: if `n === 1`, the only eligible ticket wins with index `0` and **no** RNG bytes are consumed (`drawBytesHex = ""`, counter unchanged).

### 6.3 Rejection probability

```
P(reject) = (2³² − limit) / 2³² = (2³² mod n) / 2³² < n / 2³²
```

For `n = 2500`, worst-case rejection probability per trial is under `2500 / 2³² ≈ 5.8×10⁻⁷`. Expected retries are negligible; almost every draw consumes exactly one 4-byte sample (one counter step).

### 6.4 Audit bytes

Every 4-byte sample examined (accepted or rejected) is concatenated into `drawBytesHex` for that selection. Verifiers can optionally recompute those bytes; the authoritative replay path recomputes from seed + counter and checks `index` and resulting `ticket`.

The `rng.counter` stored on the audit entry is the counter value **used for the accepting block** (i.e. `counterAfter − 1` when at least one block was consumed).

---

## 7. Mapping index → ticket number

```
pickUnbiasedIndex(eligibleSorted):
  n = eligibleSorted.length
  { index, counterAfter, drawBytesHex } = unbiasedIndex(seedBytes, seed.counter, n)
  seed.counter = counterAfter
  ticket = eligibleSorted[index]
  return { index, ticket, rng: { counter, drawBytesHex, index, eligibleSorted: copy } }
```

The full sorted list is copied into the audit entry’s `rng.eligibleSorted`. That snapshot is what independent replay uses — not a re-derivation from later UI state — so verification is robust even if someone later edits soft state.

---

## 8. After the pick: insurance vs permanent elimination

Selecting a ticket is not the same as removing it forever.

| Condition at selection | Outcome | Pool change | `permanentlyEliminated` |
|------------------------|---------|-------------|-------------------------|
| Ticket **not** insured | Eliminated | Removed from `pool`; pushed onto `eliminated` | `true` |
| Ticket **insured** | Insurance consumed | Stays in `pool`, `insured` cleared to `false`; removed from insurance marks | `false` |

In both cases a `draw_selection` audit entry is written with:

- `selectionNumber` — 1-based count of selections in the event  
- `ticket` — the number shown on stage  
- `eligibleBefore` / `eligibleAfter`  
- `prevState` / `nextState` visual states  
- `insuranceConsumed`, `permanentlyEliminated`  
- `rng` — full trace for replay  

If after the mutation `pool.length ≤ stopAt`, the engine appends `stop_reached` and status becomes `finished` until the operator continues to a lower stop tier.

**Critical fairness note:** insurance does not change selection probability. An insured ticket is still one slot in `eligibleSorted`. Insurance only changes the *consequence* of being selected.

---

## 9. Worked example (numeric)

Illustrative only — uses the published test-vector seed from `docs/audit-test-vectors.md`, not a live venue seed.

```
seed (hex) =
  00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff

commitment = SHA-256(seed) =
  4773d12e2371bb935b9a0f5439b4a1c3ad3f2414b86980f8418d1cfabdfadfef

DOMAIN = "draw-down-rng-v1"
```

Suppose at selection time:

```
eligibleSorted = [1, 2, 4, 7, 9, 12, 15, 18, 22, 30]
n = 10
limit = floor(2³² / 10) * 10 = 4294967290
```

**Draw 1** (counter starts at 0):

```
block0 = SHA-256(seed ‖ uint64be(0) ‖ DOMAIN)
first4 = b71422a1₁₆ → value = 3071550113
3071550113 < 4294967290 → accept
index = 3071550113 % 10 = 3
ticket = eligibleSorted[3] = 7
counterAfter = 1
```

If ticket `7` was uninsured, it is eliminated. Next eligible list might be:

```
eligibleSorted = [1, 2, 4, 9, 12, 15, 18, 22, 30]
n = 9
limit = 4294967292
```

**Draw 2** (counter starts at 1):

```
block1 first4 = fa19459b₁₆ → value = 4195960219
4195960219 < 4294967292 → accept
index = 4195960219 % 9 = 1
ticket = eligibleSorted[1] = 2
counterAfter = 2
```

Anyone with the revealed seed and these `eligibleSorted` arrays must obtain the same tickets in the same order. That is exactly what `replaySelections` in `src/lib/audit/verify.ts` (and the portable Audit Verifier) checks.

---

## 10. Tamper-evident audit chain

Each audit entry (including every `draw_selection`) carries:

- `seq` — 1-based sequence number  
- `prevHash` — hash of previous entry (genesis = 64 zero hex digits)  
- `hash` — `SHA-256(canonical JSON of entry without the hash field)`  

Canonicalization sorts object keys recursively and omits `hash`. Changing a ticket number, an RNG field, or an eligible count breaks that entry’s hash and/or the `prevHash` link of the next entry. Verification walks the chain and fails on the first break.

The RNG commitment and per-draw traces sit **inside** this chain, so you cannot silently rewrite history without failing both chain verification and (after reveal) seed replay.

---

## 11. Independent verification procedure

After seed reveal, a verifier:

1. Confirms package format `draw-down-audit-v1`.
2. Verifies the hash chain.
3. Checks `SHA-256(seedHex) === seed.commitment`.
4. Sets `counter = 0`.
5. For each `draw_selection` in order:
   - Read `rng.eligibleSorted` and `n = length`.
   - Run `unbiasedIndex(seed, counter, n)`.
   - Assert computed `index` equals `rng.index`.
   - Assert `eligibleSorted[index]` equals `entry.ticket`.
   - Set `counter = counterAfter`.
6. Walk ticket transition rules (no draw of held/eliminated; insurance consume vs eliminate consistency).

Tools:

- In-app: Operator → **Audit & verification** → **Verify drawing**
- Offline: `npm run audit:verify -- --json audit.json --csv audit.csv`
- Portable: `Draw-Down-Audit-Verifier.zip` from the GitHub release

CSV is a human-readable companion; **JSON is authoritative for cryptography**. The dual-file verifier detects hand-edits that make CSV disagree with JSON.

---

## 12. Probabilities (formal)

Let `E` be the eligible set at a selection, `|E| = n ≥ 1`.

For every ticket `t ∈ E`:

```
P(select t | E) = 1 / n
```

For every ticket `u ∉ E` (eliminated or held):

```
P(select u | E) = 0
```

Conditional on reaching a selection with the same `E`, outcomes are i.i.d. uniform over `E` with respect to the idealized uniform bits from rejection sampling. Across selections, `E` changes deterministically from prior outcomes (and from operator hold/insurance actions), so the **unconditional** probability that a given starting ticket survives to the end depends on those path-dependent rules — but **each individual pick**, given the eligible set at that moment, is fair.

Insurance does not alter `P(select t | E)`.

---

## 13. Threat model notes (technical)

**Defended / designed against**

- Modulo bias in index selection  
- Silent post-hoc edit of draw results (hash chain + replay)  
- Ambiguous index→ticket mapping (sorted eligible snapshot in the audit)  
- Using eliminated/held tickets (pre-draw `validateEligiblePool` + transition checks)  
- Public prediction of future draws from commitment alone (preimage of SHA-256)

**Out of scope / residual**

- A fully compromised venue machine that replaces the app binary or intercepts `crypto.getRandomValues` before seed commit can lie about entropy. Physical/process controls and comparing commitment timestamps still matter for high-stakes events.
- Operator actions that change eligibility (holds, insurance, stop/continue) are intentional product features; they are audited as events but are not “RNG cheats.”
- Pace timing and UI animation do not feed the RNG; delaying a draw does not change the next index once the eligible set and counter are fixed.

---

## 14. What is deliberately not used

| Approach | Why not |
|----------|---------|
| `Math.random()` / `Math.floor(Math.random()*n)` | Not cryptographic; not replayable from a seed commitment |
| `value % n` without rejection | Modulo bias |
| Shuffle-all-then-pop | Harder to commit/replay cleanly; eligibility changes mid-event |
| Pick random ticket in `1…N` and retry if invalid | Wastes samples; retry policy becomes part of the fairness story |
| Server-side RNG | Product is offline-first; venue must run without network |

---

## 15. Code map

| Concern | Location |
|---------|----------|
| Block hash, rejection sampling, seed helpers | `src/lib/audit/rng.ts` |
| `commitSeed`, `pickUnbiasedIndex`, audit append | `src/lib/audit/engine.ts` |
| Eligible pool invariants + sort | `src/lib/audit/validatePool.ts` |
| Live draw orchestration | `src/hooks/useDrawSession.ts` → `drawOnce` |
| Hash chain | `src/lib/audit/hashChain.ts` |
| Replay + package verify | `src/lib/audit/verify.ts` |
| Node/portable verifier twin | `scripts/lib/audit-verify-core.mjs` |
| Short overview | `docs/audit-verification.md` |
| Minimal test vectors | `docs/audit-test-vectors.md` |
| Automated RNG/chain tests | `npm run test:audit` |

---

## 16. One-sentence summary

**Draw Down picks a number by cryptographically sampling a uniform index into the sorted list of currently eligible tickets, using SHA-256(seed ‖ counter ‖ domain) with rejection sampling, then looking up that index — and it records enough of that process that a revealed seed can reproduce every selection exactly.**
