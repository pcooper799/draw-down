# DRAW DOWN — Crash Recovery Fix Report (BUG-REL-001 / BUG-REL-002)

**Date:** 2026-10-22  
**Branch:** `cursor/fix-prestart-held-restore-c70d` (local commits; not pushed)  
**App version:** 0.3.9  
**Overall recovery status:** **PASS** (Electron SIGKILL → restore exact committed state)

---

## Root cause

1. **BUG-REL-001:** Draws were committed to durable `userData/audits/<eventId>.json` (atomic write + rename), but boot only hydrated from Chromium `localStorage` (`readAutosave` / `readLocalAudit`). After `SIGKILL`, LevelDB often lost recent localStorage while the disk audit remained → UI opened idle/empty.
2. **BUG-REL-002:** Preload exposed `auditLoad`, but the renderer never listed or loaded durable audits on startup.

---

## Architecture changes

| Piece | Change |
|-------|--------|
| Durable blob | Still `{ package, localSeedHex }` plus optional `recovery` checkpoint (UI fields + session snapshot) written in the **same** atomic save |
| Disk write | `writeFile` → `fsync` → `rename` in Electron main |
| Reconstruction | `replayTicketState` / `reconstructFromDurableBlob` rebuild eliminated, insurance, held, **preStartHeld**, stopAt, history from the audit chain (source of truth) |
| Discovery | `discoverRecoveryCandidates()` via new `auditList` IPC; compares durable vs localStorage |
| Operator UI | `EventRecoveryDialog` — Restore (paused) / Review audit / Archive (does not delete evidence) |
| Apply | `applyDurableRecovery` writes local blob, hydrates session, forces **paused** + emergency-safe latch; never auto-starts draws |
| Stage | Bridge cache cleared while prompting; after restore, operator publishes paused state; stage mirrors it |
| Licensing | Unchanged — expired license can review/export; live Start/Resume still gated |

---

## Files modified

- `electron/main/index.ts` — fsync save; `audit-list`; `audit-archive`
- `electron/preload/index.ts` — expose list/archive
- `src/vite-env.d.ts` — typings
- `src/lib/audit/persist.ts` — durable blob + list/archive helpers
- `src/lib/audit/reconstructSession.ts` — **new**
- `src/lib/audit/recoveryDiscover.ts` — **new**
- `src/lib/audit/index.ts` — exports
- `src/hooks/useDrawSession.ts` — recovery attachment on every persist; `applyDurableRecovery`
- `src/components/EventRecoveryDialog.tsx` — **new**
- `src/App.tsx` — discovery + dialog (operator/combined)
- `scripts/recovery-invariants.mts`, `scripts/recovery-extra-invariants.mts` — **new**
- `qa/run-electron-reliability.mts` — restore-dialog Electron crash path
- `package.json` — `test:recovery`

---

## Test commands and results

```bash
npm run test:gameplay      # PASS
npm run test:session       # PASS
npm run test:recovery      # PASS
npx tsx scripts/recovery-extra-invariants.mts  # PASS
npm run test:audit         # PASS
npm run test:license       # PASS
npm run test:audit-verify  # PASS
npm run typecheck          # PASS
npx tsx qa/run-electron-reliability.mts  # recovery scenarios PASS (see below)
```

---

## Actual Electron crash-test evidence

Evidence directory: `qa/evidence/reliability/`

| Scenario | Disk draws | Restore dialog | Session after restore | Stage sync | Dup selectionNumbers |
|----------|------------|----------------|----------------------|------------|----------------------|
| kill-during-early-draw | 13 | Yes | paused, elim=13, localDraws=13 | remaining 47=47 | None |
| kill-mid-event | 8 | Yes | paused, elim=8, localDraws=8 | remaining 52=52 | None |
| kill-after-longer-persist-window | 11 | Yes | paused, elim=11, localDraws=11 | remaining 49=49 | None |

Each scenario: SIGKILL → relaunch same `--user-data-dir` → clear localStorage → reload → **Restore event (paused)** → verify counts.

Screenshots: `crash-*-recovered.png`, `crash-*-stage.png`, `dual-*-live.png`.

---

## Recovery scenario matrix

| Scenario | Result | Notes |
|----------|--------|-------|
| SIGKILL during live drawing | **PASS** | Exact draw counts restored |
| SIGKILL after audit commit | **PASS** | Covered by above (disk had finished rename) |
| SIGKILL before stage displays committed result | **PASS** | Persist-before-UI retained; restore matches disk |
| Relaunch with missing localStorage | **PASS** | Explicitly cleared before restore |
| Relaunch with stale localStorage | **PASS** (logic) | `durableAheadOfLocal` unit + discovery prefers durable |
| Corrupted audit data | **PASS** (unit) | `reconstructFromDurableBlob` rejects; dialog blocks Restore |
| Multiple event audit files | **PASS** (unit) | Distinct eventIds reconstruct independently |
| Insurance consumption reconstruct | **PASS** (unit) | Return then eliminate |
| Hold / preStartHeld reconstruct | **PASS** (unit) | preStartHeld keeps eliminated former holds |
| Dual-window sync after restore | **PASS** | Stage remaining matches bridge |
| Recovered event paused | **PASS** | Never auto-resumes |
| SIGKILL immediately before audit commit | **NOT ISOLATED** | Would yield prior committed state only (by design) |
| SIGKILL during prize-tier continuation lead-in | **NOT TESTED** in Electron this pass |
| SIGKILL during hold restore UI | **NOT TESTED** in Electron this pass |
| Expired activation + recovery | **NOT TESTED** in Electron (code path: restore allowed; live Start still gated) |

---

## Remaining risks

1. Kill **during** `writeFile` before `rename` may leave only the previous durable file (correct “last fully committed” behavior) — not separately fault-injected at the syscall boundary.
2. Live dual-window sampling still showed brief remaining/lastDrawn lag (2/10 samples) during fast 0.6s draws; post-restore sync was exact.
3. Packaged Windows installer path not re-tested (Linux Electron + Vite DEV).
4. Multi-monitor projector hardware still NOT TESTED.

---

## Verdict

**BUG-REL-001 / BUG-REL-002 are fixed** for the required proof:

> An actual Electron process can be killed during a live event, relaunched, and restore the exact verified committed state without silently losing or repeating draws.

Release/publish was **not** performed.
