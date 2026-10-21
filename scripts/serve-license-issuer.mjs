#!/usr/bin/env node
/**
 * Serve the local offline license issuer UI.
 * Usage: npm run license:ui
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', 'tools', 'license-issuer')
const port = Number(process.env.LICENSE_UI_PORT || 43129)
const host = '127.0.0.1'

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${host}`)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'
  const filePath = path.normalize(path.join(root, pathname))
  if (!filePath.startsWith(root)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    const ext = path.extname(filePath)
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' })
    res.end(data)
  })
})

server.listen(port, host, () => {
  const url = `http://${host}:${port}/`
  console.log('')
  console.log('Draw Down · local code issuer (offline)')
  console.log('--------------------------------------')
  console.log(url)
  console.log('')
  console.log('Keep this window open while you issue codes.')
  console.log('Press Ctrl+C to stop.')
  console.log('')

  const opener =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`
  exec(opener, () => {
    // Browser open is best-effort on headless agents
  })
})
