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
- **JSON** — full machine-readable package (`draw-down-audit-v1`) — authoritative for cryptography
- **CSV** — spreadsheet-friendly log (`draw-down-audit-csv-v1` metadata header + entry rows). Must match the JSON entry view.
- **Print / PDF** — concise organizer report (browser print dialog)

## Separate Audit Verifier (organizer tool)

A second offline program (not the stage app) cross-checks **both** exports:

```bash
npm run audit:verify -- --json path/to/audit.json --csv path/to/audit.csv
```

Portable pack (unzip → `Open-Audit-Verifier.bat`):

- Repo: `tools/audit-verifier/`
- Zip: `npm run pack:audit-verifier` → `release/tools/Draw-Down-Audit-Verifier.zip`

**Safe for public GitHub Releases** (no private keys). Unlike the Code Issuer, this verifier may be published.

Checks: hash chain, seed commitment/reveal + replay (when revealed), ticket transitions, CSV↔JSON field/hash agreement (detects hand-edits).

## Limits vs brief
- Max tickets remain **2500** (app default); brief mentioned 1500.
- Pace range remains **0.2s–30s** between draws.
- Auction **price** is not in the UI yet; release records store `auctionPrice: null`.

See also: `/cursor/stores/.../internal/audit-system-plan.md` (agent plan).
