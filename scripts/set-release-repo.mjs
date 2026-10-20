#!/usr/bin/env node
/**
 * One-time helper: rewrite OWNER placeholders to your GitHub owner/repo.
 * Usage: node scripts/set-release-repo.mjs your-github-user/draw-down
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const repo = process.argv[2]
if (!repo || !repo.includes('/')) {
  console.error('Usage: node scripts/set-release-repo.mjs owner/repo')
  process.exit(1)
}

const [owner, name] = repo.split('/')
const root = process.cwd()

function patch(file, replaceFn) {
  const full = path.join(root, file)
  const before = readFileSync(full, 'utf8')
  const after = replaceFn(before)
  if (after === before) {
    console.log(`unchanged: ${file}`)
    return
  }
  writeFileSync(full, after)
  console.log(`updated: ${file}`)
}

patch('electron-builder.json', (text) => {
  const json = JSON.parse(text)
  json.publish = [{ provider: 'github', owner, repo: name, releaseType: 'release' }]
  return `${JSON.stringify(json, null, 2)}\n`
})

patch('website/index.html', (text) =>
  text.replace(
    /window\.DRAW_DOWN_REPO = window\.DRAW_DOWN_REPO \|\| "[^"]+"/,
    `window.DRAW_DOWN_REPO = window.DRAW_DOWN_REPO || "${owner}/${name}"`,
  ),
)

patch('package.json', (text) => {
  const json = JSON.parse(text)
  json.repository = { type: 'git', url: `https://github.com/${owner}/${name}.git` }
  json.homepage = `https://${owner}.github.io/${name}/`
  return `${JSON.stringify(json, null, 2)}\n`
})

console.log(`\nRelease target set to https://github.com/${owner}/${name}`)
console.log('Next: commit, tag v0.1.0, push tags (or run the Release workflow).')
