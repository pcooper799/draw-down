# Draw Down

Windows desktop event software for ticket draw-downs. Tickets leave the pool one at a time at a staged pace until a configurable number remain. Insured tickets return to the pool after being drawn.

Paid software: each customer activates with a code that unlocks **7 days** of live drawing on that computer. After expiry they can still open the app to review audit logs, verify results, and export reports — only starting or resuming a live draw needs a new code.

## Stack

Electron + Vite + React + TypeScript + Tailwind CSS (shadcn-style Radix primitives).

## Run locally (dev)

```bash
npm install
npm run electron:dev
```

- Vite serves the UI at [http://127.0.0.1:43127](http://127.0.0.1:43127) and opens the Electron window.
- Dev mode skips the activation gate (banner shown). Packaged builds require a code.
- Local-only — no account, database, or cloud required.

## Paid activation (7 days)

Packaged Windows builds open on an activation screen until a valid code is entered (first use). Activation unlocks **live drawing for 7 days**. The license is stored in this PC’s app data (`%APPDATA%\draw-down` localStorage) — updating or reinstalling does **not** remove it until those 7 days end, or you use **Setup → Clear activation on this PC**. When that window ends, the app stays open in **review mode**: organizers can read audit history, run verification, and export reports without buying another code. Starting or resuming a live draw requires a new activation.

Each code’s signed payload includes **`iat`** (issued-at, unix seconds). The app checks that activation happens within **30 days of `iat`**. Offline codes are not single-use: the same code can be activated again after expiry while still inside that issue window (accepted cost of fully offline licensing).

Autosave keeps the last session (including insurance marks). A **finished** event reopens as a fresh all-yellow board. Mid-event restores keep greens; press **Reset** or **Setup → Clear saved session** for all yellow.

### Pricing (seller guidance)

A practical starting range to test is about **$25–$50 per activation**, depending on how polished the finished build feels for your events. Adjust after real customer feedback.

### Issue a code (seller)

Activation codes are **Ed25519-signed** (`DD2…`). The customer app ships only the public key.

**Code Issuer is local-only** — it must never be published on GitHub Releases or in the public repo. Keep the issuer folder/zip on your PC only (it holds the private signing key). Legacy `DD1…` HMAC codes still activate if you have any outstanding.

On the machine that has the private issuer tooling:

```bash
npm run license:keys    # once — creates seller private key + public key for the app
npm run license:issue -- --label "Friday gala"
```

Give the `DD2....` code to the customer after payment. Codes must be activated within 30 days of issue.

## Operator basics

1. Open **Wizard** for guided event setup (organization, tickets, insurance, prize tiers, display, review + **Test Everything**). Use **Advanced** for activation/uninstall tools.
2. Tickets start **yellow** (**No-Insurance**). Use **Insurance** only after a ticket buys it (turns green).
3. **Right-click** a ticket on the board to hold it out (e.g. auction / higher sale), then right-click again later to bring it back into the draw. Held tickets are teal (dashed); drawn-out tickets stay red and cannot return.
4. Check **Projector safety** (monitor, resolution, fullscreen, live preview) and **Move to Projector** before going live. Set **Draw pace** before the first Start (pace locks once the draw has started until Reset), then **Start**.
   Use **Emergency Stop** for an instant safe pause (no reset); resume requires an explicit confirmation and is audited.
   Wizard **Finish setup** keeps insurance marks and other fields when ticket count is unchanged.
   On stage, a **Recently drawn** strip shows the last five tickets (saved by insurance vs out), and each draw flashes large in the center with different motion for eliminated vs insurance-saved.
   On the desktop app, **Stage** and **Operator** open as separate windows (operator stays on top so it never covers the board). In the browser, use **Pop out** for the same split.
   In **projection** / fullscreen, use **Ticket size** in the operator panel (or `+` / `−` keys, or the on-stage size controls) so numbers stay readable on a big screen. Size persists with the session; the board scrolls if zoomed large.
5. When the draw **stops at your stop number**, the stage shows the celebration (last ticket out). On the **operator** panel, set a **new (lower) stop** for the next prize and Continue — the stage waits a few seconds before the next ticket. No reset required.
6. Sessions **autosave** locally. Use **Save** / **Ctrl+S**, **Export** a JSON file, or **Load** to pick up later if something goes wrong.
7. **Uninstall**: in the installed Windows app, open **Setup → Uninstall Draw Down** (or the app menu). That also clears activation data on this PC. If an older install left you still activated after uninstall, use **Setup → Clear activation on this PC**. Portable builds: delete the folder (and clear activation in Setup if needed).
8. **Audit & verification** (operator window): every selection, hold/release, insurance change, pause/stop, and continue is logged in a tamper-evident chain. Export the seed **commitment** before the event if desired; **Reveal seed** after the event to enable independent replay. Use **Verify drawing**, JSON/CSV export, or Print/PDF report — all offline.
9. **Audit Verifier** (separate organizer tool): load **both** JSON and CSV exports to re-check the hash chain and detect hand-edits that make the files disagree. `npm run audit:verify -- --json file.json --csv file.csv`, or unzip `tools/audit-verifier` / `Draw-Down-Audit-Verifier.zip` and open `Open-Audit-Verifier.bat`. Public-safe (no private keys) — unlike the Code Issuer.

### Defaults

| Setting | Default |
| --- | --- |
| Starting tickets | 400 |
| Stop when remaining | 1 |
| Pace between draws | 2.5s |
| Ticket size scale | 100% (70%–240%) |

## Build Windows installer (share with attendees)

```bash
npm install
npm run dist
# equivalents:
npm run dist:win            # NSIS + portable + zip
npm run dist:win:portable   # portable + zip only (reliable on Linux/macOS)
```

Artifacts land under:

```text
release/0.1.5/
  Draw Down-0.1.5-win-x64.exe          # NSIS installer (best from Windows / GitHub Actions)
  Draw Down-0.1.5-win-portable.exe     # single-file portable .exe (no install wizard)
  Draw Down-0.1.5-win-x64.zip          # unpacked app folder as zip
```

The desktop / Start Menu shortcut uses `build/icon.ico` (raffle drum app image).

> **Note:** The full NSIS installer is produced reliably on Windows (local or `.github/workflows/release.yml`). On Linux, `dist:win:portable` is the dependable local path — portable `.exe` is still a normal Windows download attendees can run.

## Share a download link

This project is wired for **GitHub Releases + a static download page**.

### One-time setup (after you create a real GitHub repo)

1. Push this code to GitHub (e.g. `your-user/draw-down`).
2. Point packaging + the download page at that repo:

```bash
npm run release:repo -- your-user/draw-down
git add -A && git commit -m "Configure GitHub release target"
git push
```

3. Publish a version (creates a Release with the `.exe` assets):

```bash
git tag v0.1.4
git push origin v0.1.4
```

   Or run the **Release Windows installer** workflow from the Actions tab (`workflow_dispatch`).

4. Turn on **GitHub Pages** for the `website/` folder (Settings → Pages → Deploy from branch → `/website`, or copy `website/` to `docs/` and use `/docs`).

### Links to send people

| What | URL |
| --- | --- |
| Friendly download page | `https://pcooper799.github.io/draw-down/` |
| Direct latest release | `https://github.com/pcooper799/draw-down/releases/latest` |
| Specific installer asset | From the release page → `Draw Down-0.1.4-win-x64.exe` |

The download page (`website/index.html`) auto-resolves the latest Release assets once `DRAW_DOWN_REPO` is set.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run electron:dev` | Dev server + Electron |
| `npm run typecheck` | TypeScript check |
| `npm run license:keys` | Create Ed25519 keypair (seller machine only) |
| `npm run license:issue` | Generate a paid 7-day activation code (CLI, seller machine) |
| `npm run test:gameplay` | Run draw/insurance invariant checks |
| `npm run dist` / `dist:win` | Build Windows NSIS + portable installers |
| `npm run release:repo -- owner/repo` | One-time rewrite of GitHub publish placeholders |
