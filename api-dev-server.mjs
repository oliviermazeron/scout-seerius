// ─── Serveur API local pour le développement ────────────────────────────────
// Charge .env.local et expose les routes /api/* sur le port 3001.
// Vite proxie /api → localhost:3001 en dev (configuré dans vite.config.js).
// En production Vercel, ce fichier n'est pas utilisé.

import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

// ── Routage : /api/x/y → ./api/x/y.js, sinon ./api/x.js?action=y ─────────────
// (même comportement que les réécritures de vercel.json pour les routes regroupées)
const handlers = new Map()

async function importHandler(path) {
  if (handlers.has(path)) return handlers.get(path)
  const file = join(__dirname, `${path}.js`)
  if (!existsSync(file)) return null
  const { default: handler } = await import(pathToFileURL(file).href)
  handlers.set(path, handler)
  return handler
}

async function loadHandler(pathname) {
  if (!/^\/api(\/[a-z0-9-]+)+$/.test(pathname) || pathname.startsWith('/api/_lib')) return null
  const direct = await importHandler(pathname)
  if (direct) return { handler: direct, action: null }
  const parent = pathname.replace(/\/[a-z0-9-]+$/, '')
  const grouped = parent !== '/api' ? await importHandler(parent) : null
  return grouped ? { handler: grouped, action: pathname.split('/').pop() } : null
}

// ── Serveur HTTP minimal ───────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  // Lire le body (JSON ou formulaire)
  let body = {}
  if (req.method === 'POST' || req.method === 'DELETE') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString()
    if ((req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')) {
      body = Object.fromEntries(new URLSearchParams(raw))
    } else {
      try { body = JSON.parse(raw) } catch {}
    }
  }

  // Adaptateur express-like
  const reqAdapter = {
    method: req.method,
    url: req.url,
    headers: req.headers,
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
    end(data) { res.writeHead(this._status, this._headers); res.end(data) },
  }

  try {
    const route = await loadHandler(url.pathname)
    if (!route) return res.writeHead(404).end('Not found')
    if (route.action) reqAdapter.query.action = route.action
    return await route.handler(reqAdapter, resAdapter)
  } catch (err) {
    console.error(err)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err.message }))
  }
})

server.listen(3001, () => console.log('API dev server → http://localhost:3001'))
