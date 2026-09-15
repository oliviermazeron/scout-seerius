// ─── Routes de campagne email, regroupées en une seule fonction Vercel ───────
// L'offre Hobby limite un déploiement à 12 fonctions serverless.
// vercel.json réécrit /api/outreach/:action → /api/outreach?action=:action : les
// URL publiques ne changent pas (liens de désinscription, tâche Vercel Cron).
//   POST      /api/outreach/send
//   GET|POST  /api/outreach/followups
//   GET|POST  /api/outreach/unsubscribe

import send from './_lib/routes/outreach/send.js'
import followups from './_lib/routes/outreach/followups.js'
import unsubscribe from './_lib/routes/outreach/unsubscribe.js'

const ROUTES = { send, followups, unsubscribe }

export default function handler(req, res) {
  const route = ROUTES[req.query?.action]
  if (!route) return res.status(404).json({ error: 'Route de campagne inconnue' })
  return route(req, res)
}
