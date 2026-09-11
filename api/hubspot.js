// ─── Proxy serverless → HubSpot API — création de Company ────────────────────
// Crée une fiche Entreprise dans HubSpot (portail ID: 147633255).
// Utilise uniquement des propriétés existantes dans le portail.
//
// Variables d'environnement requises :
//   HUBSPOT_TOKEN=pat-na1-xxxxx   (Private App token)
//
// Mapping segment SCOUT → valeur HubSpot (propriété "segment") :
//   banque_cantonale  → "Banque cantonale"
//   banque_affaires   → "Banque d'affaires"
//   fiduciaire        → "Fiduciaire / Trust"
//   avocat            → "Cabinet juridique / Notarial"

const SEGMENT_MAP = {
  banque_cantonale: "Banque cantonale",
  banque_affaires:  "Banque d'affaires",
  fiduciaire:       "Fiduciaire / Trust",
  avocat:           "Cabinet juridique / Notarial",
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const token = process.env.HUBSPOT_TOKEN
  if (!token) return res.status(500).json({ error: 'HUBSPOT_TOKEN non configuré' })

  const { name, domain, canton, uid, segment } = req.body ?? {}
  if (!name) return res.status(400).json({ error: 'name requis' })

  const properties = {
    name,
    ...(domain  ? { domain }                          : {}),
    ...(canton  ? { state: canton, country: 'Switzerland' } : { country: 'Switzerland' }),
    ...(segment ? { segment: SEGMENT_MAP[segment] ?? segment } : {}),
    // UID ZEFIX stocké dans la description jusqu'à création d'une propriété dédiée
    ...(uid     ? { description: `ZEFIX UID: ${uid}` } : {}),
  }

  try {
    const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    })

    const data = await createRes.json()

    // 409 = société déjà existante (même domaine) → mise à jour
    if (createRes.status === 409) {
      const existingId = data?.message?.match(/ID: (\d+)/)?.[1]
      if (existingId) {
        const patchRes = await fetch(
          `https://api.hubapi.com/crm/v3/objects/companies/${existingId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ properties }),
          }
        )
        return res.status(200).json({ action: 'updated', company: await patchRes.json() })
      }
    }

    return res.status(createRes.ok ? 201 : createRes.status).json({
      action: createRes.ok ? 'created' : 'error',
      company: data,
    })
  } catch (err) {
    return res.status(502).json({ error: `HubSpot error: ${err.message}` })
  }
}
