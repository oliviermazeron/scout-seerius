// ─── Proxy serverless → HubSpot API (sourcing) ───────────────────────────────
// Crée/met à jour des fiches Entreprise ET Contact dans HubSpot, avec la clé
// SCOUT (voir api/_lib/hubspot-scout.js).
//
// Deux usages :
//   1. POST /api/hubspot { name, domain, canton, uid, segment }
//      → crée/met à jour une Company
//   2. POST /api/hubspot { name, domain, canton, uid, segment, _contact: { email, firstname, lastname, jobtitle } }
//      → crée/met à jour la Company + crée le Contact et l'associe

import { scoutKeyConfigured, upsertCompany, upsertContact, associateContactToCompany } from './_lib/hubspot-scout.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  if (!scoutKeyConfigured()) return res.status(500).json({ error: 'Clé HubSpot SCOUT non configurée (HUBSPOT_SCOUT_KEY)' })

  const { name, domain, canton, uid, segment, _contact } = req.body ?? {}
  if (!name) return res.status(400).json({ error: 'name requis' })

  try {
    // 1. Company
    const company = await upsertCompany({ name, domain, canton, uid, segment })

    // 2. Contact + association (si _contact fourni)
    if (_contact?.email) {
      const contact = await upsertContact({
        ..._contact,
        company: _contact.company ?? name,
      })

      if (contact.id && company.id) {
        await associateContactToCompany(contact.id, company.id)
      }

      return res.status(200).json({ company, contact })
    }

    return res.status(company.action === 'created' ? 201 : 200).json({ company })
  } catch (err) {
    return res.status(502).json({ error: `HubSpot error: ${err.message}` })
  }
}
