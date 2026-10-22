# Draw Down v0.3.9 — Electron Reliability Report

**Generated:** 2026-10-22T04:49:00Z  
**Overall:** FAIL  
**App:** real Electron (`dist-electron/main` + Vite renderer) under Xvfb/`DISPLAY=:1`  
**Harness:** `npx tsx qa/run-electron-reliability.mts`  
**Evidence:** `qa/evidence/reliability/`

## Executive summary

| Area | Result | Notes |
|------|--------|-------|
| Dual BrowserWindow launch (stage + operator) | **PASS** | Both roles + preload `drawDown` API |
| Live operator ↔ stage sync during draws | **PASS** | 10 samples, 0 mismatches; stage board ≈60 cells; see `dual-stage-live.png` |
| Stage has no operator panel | **PASS** | `aside=0` |
| Forced SIGKILL during drawing | **FAIL** | Disk audit keeps committed draws; UI/session does **not** restore them |
| Durable `auditLoad` on boot | **FAIL** | Preload exposes `auditLoad`; renderer never calls it |

**Release implication:** Do not treat crash recovery as proven. Dual-window sync looks good in this environment; abrupt-kill durability does not.

---

## 1. Dual-window synchronization

### What was exercised
- Real Electron created stage (`?window=stage` → `StageMirrorApp`) and operator (`?window=operator` → session host).
- IPC bridge (`draw-down:bridge` / `bridgePublish`) active (not BroadcastChannel-only).
- Live event: 60 tickets, 0.6s pace, stop at 1.
- Sampled operator bridge state vs stage UI during drawing.

### Results
| Check | Result | Detail |
|-------|--------|--------|
| Both roles present | PASS | stage + operator URLs |
| Preload bridge API | PASS | `drawDown` on both windows |
| Stage has no operator panel | PASS | aside=0 |
| Live draws mirrored | PASS | running=true, mismatches=0, samples=10, stageCells≈60 |
| Stage ticket board populated | PASS | ≈60 cells |

### Evidence
- `qa/evidence/reliability/dual-stage-live.png` — stage DRAWING, remaining 51, last drawn #13 OUT, recent strip, full board
- `qa/evidence/reliability/dual-operator-live.png` — operator Pause / draw started
- `qa/evidence/reliability/dual-window-live-samples.json`

### Limits
- Single virtual display (no second physical projector monitor) — multi-monitor “Move to Projector” hardware path **NOT TESTED**.
- Sync sampled over ~3–4 seconds of drawing, not a full 400→1 venue run inside Electron.

---

## 2. Forced-crash durability

### Method
For each scenario: start Electron → configure → Start drawing → `SIGKILL` the process → relaunch with the **same** `--user-data-dir` → compare:

1. In-memory/localStorage session + local audit before kill  
2. Durable file `userData/audits/<eventId>.json` after kill  
3. Session + local audit after relaunch  

| Scenario | Disk draws after kill | Session restored mid-event? | Local audit draws after relaunch | Duplicate selectionNumbers? |
|----------|----------------------|-----------------------------|----------------------------------|-----------------------------|
| kill-during-early-draw | 13 | **NO** (idle / empty) | 0 | No |
| kill-mid-event | 8 | **NO** | 0 | No |
| kill-after-longer-persist-window | 11 | **NO** | 0 | No |

Prior run detail (`crash-kill-during-early-draw.json` pattern): before kill, session showed eliminations + local audit draws matching disk; after SIGKILL relaunch, disk still had those `draw_selection` entries while session/localStorage did not.

### Defects

### BUG-REL-001 — Critical — SIGKILL loses session; disk audit not rehydrated
- **Steps:** Draw several tickets in Electron; `kill -9` the app; relaunch same userData.
- **Expected:** Restores paused mid-event; committed draws neither lost nor repeated.
- **Actual:** `userData/audits/*.json` retains committed draws (atomic rename works). UI boots idle / without those eliminations. Local audit empty or reset. Operator may show a generic “Restored previous session” for setup-only autosave.
- **Where:** `flushAuditDurable` → `audit-save` (disk OK); boot path `useDrawSession` → `readAutosave` / `readLocalAudit` only; **`auditLoad` never called**.
- **Evidence:** `qa/evidence/reliability/crash-*.json`, `crash-scenarios.json`, recovered screenshots.

### BUG-REL-002 — High — Durable audit API unused on recovery
- **Steps:** Code inspection + crash relaunch.
- **Expected:** If localStorage is incomplete after crash, hydrate from durable audit via `auditLoad`.
- **Actual:** Preload exposes `auditLoad`; no renderer usage. Disk is write-only from the app’s perspective.
- **Where:** `electron/preload/index.ts` (`auditLoad`); `src/lib/audit/persist.ts` (`flushAuditDurable`); `src/hooks/useDrawSession.ts` boot.

### What passed under crash stress
- No duplicate `selectionNumber` values in durable audit files after kill.
- No leftover `.tmp` audit files after successful renames (commit-to-disk path looks sound **when the write finishes**).
- Draws were committed to disk **before** UI-only state in the cases observed (matches “persist before UI mutation” intent for the durable file).

### What was not proven
- Kill **during** the `writeFile`/`rename` window (partial `.tmp` only) — not intentionally injected at the syscall boundary.
- Kill after localStorage write but before `audit-save` completes — not isolated.
- Whether a committed draw can appear on stage without durable commit under kill — not isolated (would need tighter instrumentation).

---

## Checks (machine)

See `qa/output/electron-reliability.json` for the full check table from the latest harness run.

---

## How to re-run

```bash
# Rebuild electron main (ESM) + preload (CJS .mjs) if needed, then:
npx tsx qa/run-electron-reliability.mts
```

Requires Linux display (`DISPLAY` or Xvfb), Playwright, and Electron.

---

*No production code was changed for these reliability tests. Findings are report-only.*
