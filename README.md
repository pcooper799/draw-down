# Draw Down

Windows desktop event software for ticket draw-downs. Tickets leave the pool one at a time at a staged pace until a configurable number remain. Insured tickets return to the pool after being drawn.

Paid software: each customer activates with a code that unlocks **48 hours** of use on that computer.

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

## Paid activation (48 hours)

Packaged Windows builds open on an activation screen until a valid code is entered. Access starts at activation and lasts **48 hours**, then the app asks for a new code.

### Issue a code (seller)

```bash
npm run license:issue
npm run license:issue -- --label "Friday gala"
```

Optional: set the same secret in the issuer and the app before you ship builds:

```bash
# must match LICENSE_SECRET in src/lib/license.ts
LICENSE_SECRET=your-private-secret npm run license:issue
```

Give the printed `DD1....` code to the customer after payment. Codes must be activated within 30 days of issue.

## Operator basics

1. Open **Session setup** (gear) to set organization name, starting ticket count, stop-at remaining, and brand image.
2. Use **Insurance** to mark each ticket number that bought insurance.
3. Set **Draw pace**, then **Start**. Pause and reset as needed during a live event.
4. Sessions **autosave** locally. Use **Save** / **Ctrl+S**, **Export** a JSON file, or **Load** to pick up later if something goes wrong.

### Defaults

| Setting | Default |
| --- | --- |
| Starting tickets | 400 |
| Stop when remaining | 1 |
| Pace between draws | 2.5s |

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
| `npm run license:issue` | Generate a paid 48-hour activation code |
| `npm run test:gameplay` | Run draw/insurance invariant checks |
| `npm run dist` / `dist:win` | Build Windows NSIS + portable installers |
| `npm run release:repo -- owner/repo` | One-time rewrite of GitHub publish placeholders |
