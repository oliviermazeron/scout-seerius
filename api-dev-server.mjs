// ─── Serveur API local pour le développement ────────────────────────────────
// Charge .env.local et expose les routes /api/* sur le port 3001.
// Vite proxie /api → localhost:3001 en dev (configuré dans vite.config.js).
// En production Vercel, ce fichier n'est pas utilisé.

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Charge .env.local ──────────────────────────────────────────────────────
try {
  const env = readFileSync(join(__dirname, '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const [k, ...rest] = line.split('=')
    if (k && rest.length) process.env[k.trim()] = rest.join('=').trim()
  }
  console.log('✓ .env.local chargé')
} catch {
  console.warn('⚠ .env.local introuvable')
}

// ── Importe les handlers API ───────────────────────────────────────────────
const { default: hubspotHandler } = await import('./api/hubspot.js')
const { default: hunterHandler  } = await import('./api/hunter.js')
const { default: hubspotTasksHandler } = await import('./api/hubspot-tasks.js')
const { default: storeHandler } = await import('./api/store.js')

// ── Serveur HTTP minimal ───────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()

  // Lire le body JSON
  let body = {}
  if (req.method === 'POST') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    try { body = JSON.parse(Buffer.concat(chunks).toString()) } catch {}
  }

  // Adaptateur express-like
  const reqAdapter = {
    method: req.method,
    url: req.url,
    body,
    query: Object.fromEntries(url.searchParams),
  }
  const resAdapter = {
    _status: 200,
    _headers: {},
    status(code) { this._status = code; return this },
    setHeader(k, v) { this._headers[k] = v; return this },
    json(data) {
      res.writeHead(this._status, { 'Content-Type': 'application/json', ...this._headers })
      res.end(JSON.stringify(data))
    },
    end() { res.writeHead(this._status, this._headers); res.end() },
  }

  if (url.pathname === '/api/hubspot') return hubspotHandler(reqAdapter, resAdapter)
  if (url.pathname === '/api/hunter')  return hunterHandler(reqAdapter, resAdapter)
  if (url.pathname === '/api/hubspot-tasks') return hubspotTasksHandler(reqAdapter, resAdapter)
  if (url.pathname === '/api/store') return storeHandler(reqAdapter, resAdapter)

  res.writeHead(404).end('Not found')
})

server.listen(3001, () => console.log('API dev server → http://localhost:3001'))
