// ─── Démarre la connexion Gmail (OAuth Google) ───────────────────────────────
// POST /api/gmail/auth-url  (en-tête X-Scout-Access)  → { url }

import { randomBytes } from 'node:crypto'
import { setCors, requireAccess, publicOrigin } from '../_lib/access.js'
import { googleConfig, authUrl } from '../_lib/google.js'
import { redisOne } from '../_lib/redis.js'

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })
  if (!requireAccess(req, res)) return
  if (!googleConfig()) return res.status(503).json({ error: 'Identifiants Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) non configurés' })

  try {
    const state = randomBytes(24).toString('base64url')
    await redisOne('SET', `secret:oauth_state:${state}`, '1', 'EX', '600')
    return res.status(200).json({ url: authUrl(publicOrigin(req), state) })
  } catch (err) {
    return res.status(502).json({ error: err.message })
  }
}
