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

// ── Routage : /api/x/y → ./api/x/y.js (comme Vercel, hors dossiers _lib) ─────
const handlers = new Map()

async function loadHandler(pathname) {
  if (!/^\/api(\/[a-z0-9-]+)+$/.test(pathname)) return null
  if (handlers.has(pathname)) return handlers.get(pathname)
  const file = join(__dirname, `${pathname}.js`)
  if (!existsSync(file)) return null
  const { default: handler } = await import(pathToFileURL(file).href)
  handlers.set(pathname, handler)
  return handler
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
    const handler = await loadHandler(url.pathname)
    if (!handler) return res.writeHead(404).end('Not found')
    return await handler(reqAdapter, resAdapter)
  } catch (err) {
    console.error(err)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err.message }))
  }
})

server.listen(3001, () => console.log('API dev server → http://localhost:3001'))
