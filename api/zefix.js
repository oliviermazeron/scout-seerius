// ─── Proxy serverless → ZEFIX REST API ────────────────────────────────────────
// POST /api/zefix  { "path": "/firm/search.json", ...body }
// Proxy vers https://www.zefix.admin.ch/ZefixREST/api/v1{path}
// ZEFIX est public : aucune clé API nécessaire.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const { path: subpath, ...body } = req.body ?? {}
  if (!subpath) return res.status(400).json({ error: 'path requis' })

  const target = `https://www.zefix.admin.ch/ZefixREST/api/v1${subpath}`

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return res.status(502).json({ error: `ZEFIX proxy error: ${err.message}` })
  }
}
