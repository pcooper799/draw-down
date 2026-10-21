# Draw Down

Windows desktop event software for ticket draw-downs. Tickets leave the pool one at a time at a staged pace until a configurable number remain. Insured tickets return to the pool after being drawn.

## Stack

Electron + Vite + React + TypeScript + Tailwind CSS (shadcn-style Radix primitives).

## Run locally (dev)

```bash
npm install
npm run electron:dev
```

- Vite serves the UI at [http://127.0.0.1:43127](http://127.0.0.1:43127) and opens the Electron window.
- Local-only — no account, database, or cloud required.

## Operator basics

1. Open **Session setup** (gear) to set organization name, starting ticket count, stop-at remaining, and brand image.
2. Use **Insurance** to mark each ticket number that bought insurance.
3. Set **Draw pace**, then **Start**. Pause and reset as needed during a live event.

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
release/0.1.0/
  Draw Down-0.1.0-win-x64.exe          # NSIS installer (best from Windows / GitHub Actions)
  Draw Down-0.1.0-win-portable.exe     # single-file portable .exe (no install wizard)
  Draw Down-0.1.0-win-x64.zip          # unpacked app folder as zip
```

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
git tag v0.1.0
git push origin v0.1.0
```

   Or run the **Release Windows installer** workflow from the Actions tab (`workflow_dispatch`).

4. Turn on **GitHub Pages** for the `website/` folder (Settings → Pages → Deploy from branch → `/website`, or copy `website/` to `docs/` and use `/docs`).

### Links to send people

| What | URL |
| --- | --- |
| Friendly download page | `https://YOUR_USER.github.io/draw-down/` |
| Direct latest release | `https://github.com/YOUR_USER/draw-down/releases/latest` |
| Specific installer asset | From the release page → `Draw Down-0.1.0-win-x64.exe` |

The download page (`website/index.html`) auto-resolves the latest Release assets once `DRAW_DOWN_REPO` is set.

Until a public GitHub repo/release exists, share the `.exe` from `release/0.1.0/` however you like (Drive, Dropbox, email). Packaging is ready so the next publish is tag → push.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run electron:dev` | Dev server + Electron |
| `npm run typecheck` | TypeScript check |
| `npm run dist` / `dist:win` | Build Windows NSIS + portable installers |
| `npm run release:repo -- owner/repo` | One-time rewrite of GitHub publish placeholders |
