// ─── Routes de gestion de campagne SCOUT ─────────────────────────────────────
// vercel.json réécrit /api/campaign/:action → /api/campaign?action=:action.
//   POST  /api/campaign/audience   — construction audience avec exclusions HubSpot
//   POST  /api/campaign/list       — création segment DYNAMIC HubSpot

import audience from './_lib/routes/campaign/audience.js'
import list from './_lib/routes/campaign/list.js'

const ROUTES = { audience, list }

export default function handler(req, res) {
  const route = ROUTES[req.query?.action]
  if (!route) return res.status(404).json({ error: 'Route de campagne inconnue' })
  return route(req, res)
}
