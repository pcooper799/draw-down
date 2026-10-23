# Draw Down — Operator Guide

Local instructions for running a live ticket draw-down. Everything here works offline.

## Quick start

1. Enter your **activation code** (purchased for this PC) if prompted.
2. Open **Wizard** for guided setup, or use **Advanced** for org name, ticket count, and stop point.
3. Mark **insured** tickets (green) only after purchase.
4. Optionally **hold** auction tickets (teal) **before** you Start.
5. Set **draw pace** before Start (it locks after Start).
6. Put the stage on the projector (**Project**, **Move to Projector**, or a separate stage window).
7. Press **Start**. Award prizes when a **Stop reached** break appears; set the next stop on the operator panel and **Continue**.

## Colors on the board

| Color | Meaning |
|-------|---------|
| Green | Insured — still in; one free return |
| Yellow | No-Insurance — still in |
| Teal | Held — out for auction; not drawn |
| Red | Out — eliminated |

## Event Setup Wizard

**Wizard** walks through: Organization → Tickets → Insurance → Prize tiers → Display → Review + **Test Everything**.

- Finish keeps your insurance and other settings (it does not wipe the board when totals are unchanged).
- Use **Advanced** for activation tools, uninstall, and clear-session options.

## Insurance

- Tickets start **yellow** (No-Insurance).
- Enter purchased ticket numbers only (no random/range tools).
- **Insured (green):** first draw returns them as yellow; next draw eliminates them.
- You cannot insure a ticket that is already out or currently held.

## Holds (auction)

**Right-click** a ticket on the stage board:

- **Before Start:** hold any in-pool ticket out (teal), or restore a held ticket.
- **After Start:**
  - You **can restore** (un-hold) a held ticket back into the draw.
  - You **cannot newly hold** a ticket that was never held before Start.
  - You **can re-hold** only tickets that were already in the pre-start held set (held before Start, then restored).
- Drawn-out (red) tickets cannot come back.
- Holding while the draw is running auto-pauses first.

If a hold is blocked, the operator notice explains why.

## Pace lock

- Set seconds between draws **before** the first Start (slider or number).
- Range: **0.2s–30s** between draws.
- After Start, pace is locked until a gated **Reset** for a new event.

## Organization colors

- In **Wizard** (Organization step) or **Advanced**, set custom colors for this org: brand accent, Insured, No-Insurance, Held, and Out.
- Colors apply to the stage board, welcome cover, and operator accent chrome. Saved with the session.
- **Defaults** restores the standard Draw Down palette.

## Projection & operator window

- **Project** (`P`): hide docked controls for a clean audience view. `Esc` / `P` restores controls.
- **Pop out** / operator window: controls stay on a separate always-on-top window; stage stays clear.
- **Projector Safety**: pick monitor, check resolution/fullscreen, **Move to Projector**.
- Stage shows the board, recent draws, last drawn, and prize-stop celebration — not operator continue controls.

## Welcome cover (setup)

- Before **Start**, the stage can show a **Cover**: “Welcome to {org}”, **Draw Down**, and the four **color meanings** (Insured / No-Insurance / Held / Out).
- Use this while you finish insurance, holds, and projector setup so the audience does not see an unfinished board.
- Operator **Cover** / **Board** toggles the welcome cover vs the live ticket grid. Cover hides automatically when you Start.

## Ticket size

- Scale board numbers about **70–240%** (operator slider, on-stage ±, or `+` / `−` keys).
- Saved with the session. Large zoom scrolls the board.

## Prize stops & Continue

- Draw stops when remaining tickets hit your **stop at** number.
- **Stage / projection** shows celebration only: Stop reached, org name, last ticket (OUT). No continue buttons on the audience view.
- On the **operator** panel (or operator window dialog): set a **lower** next stop and press **Continue**.
- After Continue, the stage waits about **3 seconds**, then keeps drawing until you pause, hit the next stop, or use Emergency Stop — it should not stop after a single ticket on its own.

## Emergency Stop

- Big red **Emergency Stop**: instant safe pause (pool/insurance/history kept).
- Resume needs confirmation (safe-pause latch).
- Written to the audit log.

## Save / export / load

- Autosaves locally on this PC.
- **Save**, **Export** (download file), **Load** restore a session.
- A running draw restores as **paused** so you can resume safely.

## Reset (audit gate)

- Before first Start: Reset is free (clears to all yellow).
- After Start: Reset asks for your **name**, **reason**, and a **Yes — cannot be undone** checkbox. That closes the current audit log and opens a new one.

## Activation & license

- A paid activation code unlocks about **7 days** of live drawing on that PC.
- Codes must be activated within the issue window printed with your purchase.
- Offline — no account required.
- After expiry: **review mode** — open past events, verify, and export; you cannot start/resume live draws until you enter a new code.
- Get a new code from your seller when you need another event window. (Code minting tools are seller-only and are not part of the customer app.)

## Audit & fairness

- Every draw builds an offline audit: hash chain, seed commit/reveal, deterministic replay.
- Export **JSON**, **CSV**, and **Print / PDF** from the operator panel. Use **Verify drawing** in-app.
- Optional **Audit Verifier** (separate download on the release page): load **both** JSON and CSV to re-check crypto rules and catch hand-edits.

## Keyboard shortcuts (common)

| Key | Action |
|-----|--------|
| `Space` | Emergency stop while drawing; start/resume when stopped (license permitting) |
| `P` | Toggle projection mode |
| `+` / `−` | Ticket size |
| `Ctrl/Cmd+S` | Save |
| `Ctrl/Cmd+Shift+O` | Operator window |

## Tips for event night

1. Run **Wizard → Test Everything** on the venue PC and projector before doors open.
2. Mark insurance and pre-holds before Start.
3. Keep the operator panel where only staff can reach Continue / Reset / Emergency Stop.
4. After each prize stop, confirm the next stop number before Continue.
5. Export audit files before you leave the venue.
