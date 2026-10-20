# Draw Down

Windows desktop event software for ticket draw-downs. Tickets leave the pool one at a time at a staged pace until a configurable number remain. Insured tickets return to the pool after being drawn.

## Stack

Electron + Vite + React + TypeScript + Tailwind CSS (with shadcn-style Radix primitives).

## Run locally

```bash
npm install
npm run electron:dev
```

- Vite serves the UI at [http://127.0.0.1:43127](http://127.0.0.1:43127) and opens the Electron window.
- Local-only — no account, database, or cloud required.

## Operator basics

1. Open **Session setup** (gear) to set organization name, starting ticket count, stop-at remaining, and brand image.
2. Use **Insurance** to mark tickets by number, range, or random percent.
3. Set **Draw pace**, then **Start**. Pause and reset as needed during a live event.

### Defaults

| Setting | Default |
| --- | --- |
| Starting tickets | 400 |
| Stop when remaining | 1 |
| Pace between draws | 2.5s |

## Build (Windows installer)

```bash
npm run build
```

Artifacts land under `release/`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run electron:dev` | Dev server + Electron |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build + electron-builder |
