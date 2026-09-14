// ─── Stockage partagé SCOUT → Upstash Redis (API REST) ───────────────────────
// GET  /api/store                                   → { data: { [key]: { [field]: value } } }
// POST /api/store { ops: [{ key, field, value }] }  → value null = suppression
//
// Chaque clé applicative (ex. scout_campaign) est un hash Redis "scout:<clé>",
// chaque entrée (société, cible de campagne, deal…) un champ JSON du hash.
//
// Variables d'environnement (injectées par l'intégration Upstash de Vercel) :
//   KV_REST_API_URL + KV_REST_API_TOKEN
//   (ou UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)

const PREFIX    = 'scout:'
const KEY_RE    = /^scout_[a-z0-9_]{1,60}$/
const MAX_OPS   = 500
const MAX_VALUE = 100_000

function config() {
  const url   = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

async function pipeline({ url, token }, commands) {
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!r.ok) throw new Error(`Upstash HTTP ${r.status}`)
  const results = await r.json()
  const failed = results.find((x) => x.error)
  if (failed) throw new Error(failed.error)
  return results.map((x) => x.result)
}

async function readAll(cfg) {
  const keys = []
  let cursor = '0'
  do {
    const [[next, batch]] = await pipeline(cfg, [['SCAN', cursor, 'MATCH', `${PREFIX}*`, 'COUNT', '1000']])
    cursor = String(next)
    keys.push(...batch)
  } while (cursor !== '0')

  if (!keys.length) return {}
  const hashes = await pipeline(cfg, keys.map((k) => ['HGETALL', k]))

  const data = {}
  keys.forEach((k, i) => {
    const flat = hashes[i] ?? []
    const entries = {}
    for (let j = 0; j < flat.length; j += 2) {
      try { entries[flat[j]] = JSON.parse(flat[j + 1]) } catch {}
    }
    data[k.slice(PREFIX.length)] = entries
  })
  return data
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const cfg = config()
  if (!cfg) return res.status(503).json({ error: 'Stockage partagé non configuré (Upstash Redis)' })

  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ data: await readAll(cfg) })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

    // sendBeacon (fermeture d'onglet) peut arriver en texte brut
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const ops = body?.ops
    if (!Array.isArray(ops) || !ops.length || ops.length > MAX_OPS) {
      return res.status(400).json({ error: `ops[] requis (1 à ${MAX_OPS})` })
    }

    const commands = []
    for (const { key, field, value } of ops) {
      if (!KEY_RE.test(key ?? '') || typeof field !== 'string' || !field || field.length > 300) {
        return res.status(400).json({ error: `Opération invalide : ${key} / ${field}` })
      }
      if (value == null) {
        commands.push(['HDEL', PREFIX + key, field])
      } else {
        const json = JSON.stringify(value)
        if (json.length > MAX_VALUE) return res.status(413).json({ error: `Valeur trop volumineuse : ${key} / ${field}` })
        commands.push(['HSET', PREFIX + key, field, json])
      }
    }

    await pipeline(cfg, commands)
    return res.status(200).json({ ok: true, applied: commands.length })
  } catch (err) {
    return res.status(502).json({ error: `Upstash error: ${err.message}` })
  }
}
