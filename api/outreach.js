// ─── Routes de campagne email, regroupées en une seule fonction Vercel ───────
// L'offre Hobby limite un déploiement à 12 fonctions serverless.
// vercel.json réécrit /api/outreach/:action → /api/outreach?action=:action : les
// URL publiques ne changent pas (liens de désinscription, tâche Vercel Cron).
//   POST      /api/outreach/send
//   GET|POST  /api/outreach/followups
//   GET|POST  /api/outreach/unsubscribe
//   POST      /api/outreach/qualify      (cibles SWIFT → affaire « Deal sourcing »)

import send from './_lib/routes/outreach/send.js'
import followups from './_lib/routes/outreach/followups.js'
import unsubscribe from './_lib/routes/outreach/unsubscribe.js'
import qualify from './_lib/routes/outreach/qualify.js'
import audience from './_lib/routes/campaign/audience.js'
import list from './_lib/routes/campaign/list.js'

const ROUTES = { send, followups, unsubscribe, qualify, audience, list }

export default function handler(req, res) {
  const route = ROUTES[req.query?.action]
  if (!route) return res.status(404).json({ error: 'Route de campagne inconnue' })
  return route(req, res)
}
