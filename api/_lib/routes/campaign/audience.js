// ─── Construction d'audience avec exclusion HubSpot ───────────────────────────
// POST /api/campaign?action=audience
// Body : {
//   contacts    : [{ email, segment, firstName, lastName, companyKey, companyName, role? }],
//   campaignId  : "SCOUT-2026-09-INTERMEDIAIRES-V1",
//   cooldownDays: 90,                // facultatif, défaut 90
//   audience    : "intermediaires"   // facultatif
// }
// → { included, excluded, stats }

import { setCors, requireAccess } from '../../access.js'
import { scoutKeyConfigured } from '../../hubspot-scout.js'
import { buildAudience } from '../../hubspot-campaign.js'
import { isAudience, DEFAULT_AUDIENCE } from '../../hubspot-comms.js'

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })
  if (!requireAccess(req, res)) return

  const { contacts, campaignId, cooldownDays, audience } = req.body ?? {}
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'contacts (tableau non vide) requis' })
  }
  if (!campaignId?.trim()) {
    return res.status(400).json({ error: 'campaignId requis' })
  }

  const aud = isAudience(audience) ? audience : DEFAULT_AUDIENCE

  if (!scoutKeyConfigured()) {
    return res.status(503).json({ error: 'Clé HubSpot SCOUT non configurée' })
  }

  try {
    const result = await buildAudience(contacts, {
      campaignId: campaignId.trim(),
      cooldownDays: Number(cooldownDays ?? 90),
      audience: aud,
    })
    return res.status(200).json(result)
  } catch (err) {
    console.error('[SCOUT campaign/audience]', err.message)
    return res.status(502).json({ error: err.message })
  }
}
