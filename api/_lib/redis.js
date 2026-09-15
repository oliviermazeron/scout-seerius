// ─── Upstash Redis (API REST) — helpers partagés par les routes /api ─────────
// Variables d'environnement (injectées par l'intégration Upstash de Vercel) :
//   KV_REST_API_URL + KV_REST_API_TOKEN  (ou UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)

export function redisConfig() {
  const url   = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

export async function redis(commands) {
  const cfg = redisConfig()
  if (!cfg) throw new Error('Stockage Upstash Redis non configuré')
  const r = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!r.ok) throw new Error(`Upstash HTTP ${r.status}`)
  const results = await r.json()
  const failed = results.find((x) => x.error)
  if (failed) throw new Error(failed.error)
  return results.map((x) => x.result)
}

export async function redisOne(...command) {
  const [result] = await redis([command.map(String)])
  return result
}

export async function hgetJSON(key, field) {
  const raw = await redisOne('HGET', key, field)
  return raw == null ? null : JSON.parse(raw)
}

export function hsetJSON(key, field, value) {
  return redisOne('HSET', key, field, JSON.stringify(value))
}

export function parseHash(flat = []) {
  const entries = {}
  for (let i = 0; i < flat.length; i += 2) {
    try { entries[flat[i]] = JSON.parse(flat[i + 1]) } catch {}
  }
  return entries
}

export async function hgetallJSON(key) {
  return parseHash(await redisOne('HGETALL', key))
}
