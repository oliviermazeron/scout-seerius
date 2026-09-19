// GET /api/outreach/setup — crée les 9 propriétés HubSpot de tracking SCOUT
// Nécessite crm.schemas.contacts.write sur la clé HUBSPOT_SCOUT_KEY.
// À appeler une seule fois depuis un navigateur connecté à SCOUT.
import { setCors, requireAccess } from '../../access.js'
import { createTrackingProperties } from '../../hubspot-scout.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!requireAccess(req, res)) return
  try {
    const results = await createTrackingProperties()
    const ok  = results.filter((r) => r.ok || r.status === 409)
    const err = results.filter((r) => !r.ok && r.status !== 409)
    return res.status(err.length ? 207 : 200).json({ created: ok.length, errors: err })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
