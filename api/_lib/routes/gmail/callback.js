// ─── Retour OAuth Google → enregistre l'autorisation Gmail ───────────────────
// GET /api/gmail/callback?code=…&state=…  → redirige vers /?gmail=connected|error

import { publicOrigin } from '../../access.js'
import { exchangeCode } from '../../google.js'
import { redisOne } from '../../redis.js'

function redirect(res, location) {
  res.setHeader('Location', location)
  return res.status(302).end()
}

export default async function handler(req, res) {
  const origin = publicOrigin(req)
  const { code, state, error } = req.query ?? {}
  const fail = (reason) => redirect(res, `${origin}/?gmail=error&reason=${encodeURIComponent(String(reason).slice(0, 160))}`)

  if (error) return fail(error === 'access_denied' ? 'Autorisation refusée' : error)
  if (!code || !state) return fail('Réponse Google incomplète')

  try {
    const valid = await redisOne('GETDEL', `secret:oauth_state:${state}`)
    if (!valid) return fail('Lien de connexion expiré, recommencez')
    await exchangeCode(code, origin)
    return redirect(res, `${origin}/?gmail=connected`)
  } catch (err) {
    return fail(err.message)
  }
}
