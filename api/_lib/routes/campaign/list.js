// ─── Création du segment DYNAMIC HubSpot pour une campagne ───────────────────
// POST /api/campaign?action=list
// Body : { campaignId: "SCOUT-2026-09-INTERMEDIAIRES-V1" }
// → { ok, listId, name, existing?, error? }
//
// Un échec n'est pas bloquant pour l'envoi : le segment est un confort de
// lecture. Logger l'erreur et poursuivre côté client.

import { setCors, requireAccess } from '../../access.js'
import { scoutKeyConfigured } from '../../hubspot-scout.js'
import { createCampaignList } from '../../hubspot-campaign.js'

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })
  if (!requireAccess(req, res)) return

  const { campaignId } = req.body ?? {}
  if (!campaignId?.trim()) {
    return res.status(400).json({ error: 'campaignId requis' })
  }

  if (!scoutKeyConfigured()) {
    return res.status(503).json({ error: 'Clé HubSpot SCOUT non configurée' })
  }

  try {
    const result = await createCampaignList(campaignId.trim())
    return res.status(result.ok ? 200 : 502).json(result)
  } catch (err) {
    console.error('[SCOUT campaign/list]', err.message)
    return res.status(502).json({ error: err.message })
  }
}
