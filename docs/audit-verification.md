# Offline audit & verification

Draw Down records a tamper-evident, fully offline audit of each event.

## What is recorded
- Ticket selections (with eligible counts before/after)
- Insurance mark / clear / consume
- Hold and release (auction) with eligible count changes
- Automatic stop thresholds, continue, pause, resume
- Config changes and integrity halts

## Cryptographic drawing
1. Before the first selection, a random 32-byte seed is created.
2. **Commitment** = SHA-256(seed) is logged (`seed_committed`). Export/share this before draws if you want a public pre-commitment.
3. Each selection uses SHA-256(seed ‖ counter ‖ domain) with **rejection sampling** for an unbiased index into the **sorted** eligible ticket list.
4. After the event, **Reveal seed** writes the seed into the audit package so others can replay.

## Verification
Operator panel → **Audit & verification** → **Verify drawing** checks:
- Hash chain integrity
- Seed commitment / reveal match
- Deterministic replay of selections
- Ticket transition rules (no selecting eliminated/held tickets)

## Exports
- **JSON** — full machine-readable package (`draw-down-audit-v1`)
- **CSV** — spreadsheet-friendly log
- **Print / PDF** — concise organizer report (browser print dialog)

## Limits vs brief
- Max tickets remain **2500** (app default); brief mentioned 1500.
- Fastest pace remains **0.2s** (not 0.1s).
- Auction **price** is not in the UI yet; release records store `auctionPrice: null`.

See also: `/cursor/stores/.../internal/audit-system-plan.md` (agent plan).
