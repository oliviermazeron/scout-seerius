// ─── Routes Gmail, regroupées en une seule fonction Vercel ───────────────────
// L'offre Hobby limite un déploiement à 12 fonctions serverless.
// vercel.json réécrit /api/gmail/:action → /api/gmail?action=:action : les URL
// publiques ne changent pas (dont le retour OAuth /api/gmail/callback déclaré
// chez Google).
//   POST        /api/gmail/auth-url
//   GET         /api/gmail/callback
//   GET|DELETE  /api/gmail/status

import authUrl from './_lib/routes/gmail/auth-url.js'
import callback from './_lib/routes/gmail/callback.js'
import status from './_lib/routes/gmail/status.js'

const ROUTES = { 'auth-url': authUrl, callback, status }

export default function handler(req, res) {
  const route = ROUTES[req.query?.action]
  if (!route) return res.status(404).json({ error: 'Route Gmail inconnue' })
  return route(req, res)
}
